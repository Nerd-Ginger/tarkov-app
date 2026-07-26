import type {
  DataSource,
  RawAmmo,
  RawBarter,
  RawCraft,
  RawHideoutStation,
  RawMap,
  RawStim,
  RawStimEffect,
  RawTask,
} from '../types'
import snapshot from '../data/snapshot.json'
import { forceJson, tasksFromJson } from './jsonFallback'
import type { JsonTaskData } from './jsonFallback'
import { GRAPHQL_TIMEOUT_MS, describe } from './shared'

const API_URL = 'https://api.tarkov.dev/graphql'
const CACHE_KEY = 'tarkov.tasks.v13'
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

/**
 * Stims are fetched on their own rather than folded into QUERY above.
 *
 * `Query.items` is declared `[Item]!` — non-null — so graphql-js can't null the
 * field on a resolver error; the error propagates to the root and takes `data`
 * with it. Quests, hideout, barters, crafts and maps must not be able to die for
 * an optional dataset.
 *
 * `properties` resolves to a different union member for the one injector that
 * isn't a stim (Morphine), which comes through this fragment as {} — filtered out
 * when flattening. Field names verified against the-hideout/tarkov-api's
 * schema-static.mjs: note GraphQL exposes `skillName`, where the JSON API uses a
 * bare `skill`.
 */
const STIM_QUERY = `{
  stims: items(lang: en, gameMode: pve, types: [injectors, meds, provisions]) {
    id
    name
    shortName
    properties {
      ... on ItemPropertiesStim {
        useTime
        cures
        stimEffects { type chance delay duration value percent skillName }
      }
      ... on ItemPropertiesPainkiller {
        uses
        useTime
        cures
        painkillerDuration
        energyImpact
        hydrationImpact
      }
      ... on ItemPropertiesFoodDrink {
        energy
        hydration
        stimEffects { type chance delay duration value percent skillName }
      }
    }
  }
}`

interface GqlStimItem {
  id: string
  name: string | null
  shortName: string | null
  /** Union of the three fragments — which fields land tells us the kind. */
  properties: {
    useTime?: number | null
    uses?: number | null
    cures?: (string | null)[] | null
    stimEffects?: (RawStimEffect | null)[] | null
    painkillerDuration?: number | null
    energyImpact?: number | null
    hydrationImpact?: number | null
    energy?: number | null
    hydration?: number | null
  } | null
}

/** One-off impact (energy/hydration), modelled as a zero-duration effect. */
function gqlImpact(type: string, value: number | null | undefined): RawStimEffect[] {
  return typeof value === 'number' && value !== 0
    ? [{ type, chance: 1, delay: 0, duration: 0, value, percent: false, skillName: null }]
    : []
}

export interface TaskCache {
  fetchedAt: number
  tasks: RawTask[]
  stations: RawHideoutStation[]
  ammo: RawAmmo[]
  barters: RawBarter[]
  crafts: RawCraft[]
  maps: RawMap[]
  stims: RawStim[]
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
    // `stims` is deliberately NOT checked: this guard is for rejecting a partly
    // written fetch, not an older schema (that's what CACHE_KEY is for), and an
    // optional dataset must never be able to invalidate the essential ones.
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

type TaskData = Omit<TaskCache, 'fetchedAt' | 'source' | 'stims'>

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

async function fetchStimsGraphql(): Promise<RawStim[]> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: STIM_QUERY }),
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`tarkov.dev API returned ${res.status}`)
  const json = await res.json()
  const rows = (json?.data?.stims ?? []) as (GqlStimItem | null)[]
  return rows.flatMap((i): RawStim[] => {
    const p = i?.properties
    if (!i || !p) return []
    const own = (p.stimEffects ?? []).filter((e): e is RawStimEffect => e != null)

    // which fragment resolved tells us the kind — painkillers are the only ones
    // carrying painkillerDuration, food the only ones carrying energy/hydration
    let kind: RawStim['kind']
    let stimEffects: RawStimEffect[]
    if (typeof p.painkillerDuration === 'number' || typeof p.energyImpact === 'number') {
      kind = 'Painkiller'
      stimEffects = [
        ...(typeof p.painkillerDuration === 'number' && p.painkillerDuration > 0
          ? [
              {
                type: 'PainRelief',
                chance: 1,
                delay: 0,
                duration: p.painkillerDuration,
                value: 0,
                percent: false,
                skillName: null,
              },
            ]
          : []),
        ...gqlImpact('EnergyImpact', p.energyImpact),
        ...gqlImpact('HydrationImpact', p.hydrationImpact),
      ]
    } else if (typeof p.energy === 'number' || typeof p.hydration === 'number') {
      kind = 'Food'
      // plain food and water only restore energy/hydration — nourishment, not a
      // buff. Skip unless it carries a real effect.
      if (own.length === 0) return []
      stimEffects = [...own, ...gqlImpact('EnergyImpact', p.energy), ...gqlImpact('HydrationImpact', p.hydration)]
    } else {
      kind = 'Stim'
      stimEffects = own
    }

    // nothing to say on a buff/debuff page (bandages, plain water, Morphine's
    // sibling meds) — and an unresolved fragment lands here too
    if (stimEffects.length === 0) return []
    return [
      {
        item: { id: i.id, name: i.name ?? '', shortName: i.shortName ?? '' },
        kind,
        useTime: typeof p.useTime === 'number' ? p.useTime : null,
        uses: typeof p.uses === 'number' ? p.uses : null,
        cures: (p.cures ?? []).filter((c): c is string => typeof c === 'string'),
        stimEffects,
      },
    ]
  })
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
    // stims have no JSON endpoint either; the trailing [] matters because
    // SNAPSHOT predates the field, so base.stims can be undefined
    stims: json.stims ?? base.stims ?? [],
  }
}

export async function fetchTasks(): Promise<TaskCache> {
  let gqlError: unknown
  if (!forceJson()) {
    try {
      const [core, stims] = await Promise.all([
        fetchTasksGraphql(),
        // optional dataset: a stim failure must never fail the whole load
        fetchStimsGraphql().catch(() => null),
      ])
      if (stims && stims.length === 0) console.warn('tarkov.dev returned no stims')
      const cache: TaskCache = {
        fetchedAt: Date.now(),
        source: 'graphql',
        ...core,
        // keep whatever we had rather than blanking the view on an empty result
        stims: stims?.length ? stims : (readCache()?.stims ?? SNAPSHOT.stims ?? []),
      }
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
