import type { RawAmmo, RawHideoutStation, RawTask } from '../types'
import snapshot from '../data/snapshot.json'

const API_URL = 'https://api.tarkov.dev/graphql'
const CACHE_KEY = 'tarkov.tasks.v6'
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
      type
      description
      optional
      maps { name }
      ... on TaskObjectiveItem { foundInRaid item { id name shortName } count }
    }
    finishRewards {
      items { item { id name shortName } count }
      traderStanding { trader { name } standing }
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
}`

export interface TaskCache {
  fetchedAt: number
  tasks: RawTask[]
  stations: RawHideoutStation[]
  ammo: RawAmmo[]
}

export function readCache(): TaskCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TaskCache
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) return null
    // a cache missing stations or ammo is from an incomplete fetch — refetch instead
    if (!Array.isArray(parsed.stations) || !Array.isArray(parsed.ammo)) return null
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

export async function fetchTasks(): Promise<TaskCache> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY }),
  })
  if (!res.ok) throw new Error(`tarkov.dev API returned ${res.status}`)
  const json = await res.json()
  // drop null entries — a failed per-task resolver nulls that array slot
  const tasks: RawTask[] = (json?.data?.tasks ?? []).filter(Boolean)
  const stations: RawHideoutStation[] = json?.data?.hideoutStations ?? []
  const ammo: RawAmmo[] = (json?.data?.ammo ?? []).filter(Boolean)
  if (tasks.length === 0) throw new Error('tarkov.dev API returned no tasks')
  // merge XP in from the aliased selection (null rows = XP unknown, keep quest)
  const xpById = new Map<string, number>()
  for (const row of (json?.data?.xpTable ?? []) as ({ id: string; experience: number } | null)[]) {
    if (row) xpById.set(row.id, row.experience)
  }
  for (const t of tasks) t.experience = xpById.get(t.id) ?? 0
  const cache = { fetchedAt: Date.now(), tasks, stations, ammo }
  writeCache(cache)
  return cache
}
