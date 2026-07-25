import type { DataSource, RawAmmo, RawBarter, RawCraft, RawHideoutStation, RawMap, RawTask } from '../types'
import snapshot from '../data/snapshot.json'
import { forceJson, tasksFromJson } from './jsonFallback'
import type { JsonTaskData } from './jsonFallback'
import { GRAPHQL_TIMEOUT_MS, describe } from './shared'

const API_URL = 'https://api.tarkov.dev/graphql'
const CACHE_KEY = 'tarkov.tasks.v11'
export const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12h

/**
 * Quest data bundled at build time so the app works instantly — even offline, and
 * even when opened as a standalone file:// page before any live fetch. Live data
 * refreshes over the top when the network is available.
 */
export const SNAPSHOT = snapshot as TaskCache

// gameMode: pve — we play the PvE version; its quest list differs from regular (PvP).
const QUERY = `{
  tasks(lang: en, gameMode: pve) {
    id
    name
    minPlayerLevel
    kappaRequired
    lightkeeperRequired
    wikiLink
    trader { name }
    map { name }
    taskRequirements { task { id } status }
    objectives {
      id
      type
      description
      optional
      maps { name }
      ... on TaskObjectiveItem { foundInRaid item { id name shortName } count }
    }
    finishRewards {
      items { item { id name shortName } count }
      traderStanding { trader { name } standing }
      offerUnlock { item { id name shortName } trader { name } level }
      traderUnlock { name }
      skillLevelReward { name level }
    }
  }
  # experience fetched separately: its resolver 500s on one task, and since the
  # field is non-nullable GraphQL nulls the WHOLE task — this way only the XP
  # number is lost for that task, not the quest itself
  xpTable: tasks(lang: en, gameMode: pve) { id experience }
  ammo(lang: en, gameMode: pve) {
    item { id name shortName }
    caliber
    damage
    penetrationPower
    armorDamage
    fragmentationChance
    initialSpeed
    accuracyModifier
    recoilModifier
    tracer
  }
  hideoutStations(lang: en, gameMode: pve) {
    id
    name
    levels {
      level
      itemRequirements { item { id name shortName } count }
      stationLevelRequirements { station { id name } level }
      traderRequirements { trader { name } level }
      skillRequirements { name level }
    }
  }
  barters(gameMode: pve) {
    id
    trader { name }
    level
    taskUnlock { id name }
    requiredItems { item { id name shortName types } count }
    rewardItems { item { id name shortName } count }
  }
  crafts(gameMode: pve) {
    id
    station { id name }
    level
    duration
    requiredItems { item { id name shortName types } count }
    rewardItems { item { id name shortName } count }
  }
  maps(lang: en, gameMode: pve) {
    name
    normalizedName
    locks { lockType needsPower key { id name shortName wikiLink } }
  }
}`

export interface TaskCache {
  fetchedAt: number
  tasks: RawTask[]
  stations: RawHideoutStation[]
  ammo: RawAmmo[]
  barters: RawBarter[]
  crafts: RawCraft[]
  maps: RawMap[]
  /** Which upstream served this data — absent on caches written before the fallback existed. */
  source?: DataSource
}

export function readCache(): TaskCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TaskCache
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) return null
    // a cache missing any dataset is from an incomplete fetch — refetch instead
    if (!Array.isArray(parsed.stations) || !Array.isArray(parsed.ammo)) return null
    if (!Array.isArray(parsed.barters) || !Array.isArray(parsed.crafts)) return null
    if (!Array.isArray(parsed.maps)) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(cache: TaskCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // storage full or unavailable — live data still works this session
  }
}

type TaskData = Omit<TaskCache, 'fetchedAt' | 'source'>

async function fetchTasksGraphql(): Promise<TaskData> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY }),
    // without a deadline a hung VPS never fails, so the fallback never runs
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`tarkov.dev API returned ${res.status}`)
  const json = await res.json()
  // drop null entries — a failed per-task resolver nulls that array slot
  const tasks: RawTask[] = (json?.data?.tasks ?? []).filter(Boolean)
  const stations: RawHideoutStation[] = json?.data?.hideoutStations ?? []
  const ammo: RawAmmo[] = (json?.data?.ammo ?? []).filter(Boolean)
  const barters: RawBarter[] = (json?.data?.barters ?? []).filter(Boolean)
  const crafts: RawCraft[] = (json?.data?.crafts ?? []).filter(Boolean)
  const maps: RawMap[] = (json?.data?.maps ?? []).filter(Boolean)
  if (tasks.length === 0) throw new Error('tarkov.dev API returned no tasks')
  // merge XP in from the aliased selection (null rows = XP unknown, keep quest)
  const xpById = new Map<string, number>()
  for (const row of (json?.data?.xpTable ?? []) as ({ id: string; experience: number } | null)[]) {
    if (row) xpById.set(row.id, row.experience)
  }
  for (const t of tasks) t.experience = xpById.get(t.id) ?? 0
  return { tasks, stations, ammo, barters, crafts, maps }
}

/**
 * Fold JSON-sourced data onto the best data we already have.
 *
 * The JSON API carries ~11 fewer quests than GraphQL (Oil Change, War Never
 * Changes, A Wedge Between Us and friends), so its task list is *unioned* with
 * what we had rather than replacing it — otherwise those quests would vanish
 * mid-wipe. The other datasets are swapped wholesale when non-empty: ids aren't
 * guaranteed to line up across the two sources, and duplicate stations or
 * barters would corrupt the normalizers.
 */
function mergeWithBase(json: JsonTaskData): TaskCache {
  const base = readCache() ?? SNAPSHOT
  const fromJson = new Set(json.tasks.map((t) => t.id))
  return {
    fetchedAt: Date.now(),
    source: 'json',
    tasks: [...json.tasks, ...base.tasks.filter((t) => !fromJson.has(t.id))],
    stations: json.stations.length > 0 ? json.stations : base.stations,
    // ammo has no JSON endpoint; null = couldn't derive it from item properties
    ammo: json.ammo ?? base.ammo,
    barters: json.barters.length > 0 ? json.barters : base.barters,
    crafts: json.crafts.length > 0 ? json.crafts : base.crafts,
    maps: json.maps.length > 0 ? json.maps : base.maps,
  }
}

export async function fetchTasks(): Promise<TaskCache> {
  let gqlError: unknown
  if (!forceJson()) {
    try {
      const cache: TaskCache = { fetchedAt: Date.now(), source: 'graphql', ...(await fetchTasksGraphql()) }
      writeCache(cache)
      return cache
    } catch (e) {
      gqlError = e
    }
  }
  try {
    const cache = mergeWithBase(await tasksFromJson())
    writeCache(cache)
    return cache
  } catch (jsonError) {
    throw new Error(`quest data unavailable — graphql: ${describe(gqlError)}; json: ${describe(jsonError)}`)
  }
}
