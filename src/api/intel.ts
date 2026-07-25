import type { BossEscort, DataSource, Intel } from '../types'
import { forceJson, intelFromJson } from './jsonFallback'
import { GRAPHQL_TIMEOUT_MS, describe } from './shared'

const API_URL = 'https://api.tarkov.dev/graphql'
const CACHE_KEY = 'tarkov.intel.v2'
export const INTEL_MAX_AGE_MS = 10 * 60 * 1000 // 10 min — goon reports move; resets are absolute

const INTEL_QUERY = `{
  traders(gameMode: pve) { name resetTime }
  goonReports { map { name } timestamp }
  maps(gameMode: pve) {
    name
    bosses {
      boss { name }
      spawnChance
      escorts { boss { name } amount { count chance } }
    }
  }
}`

interface RawBossSlot {
  boss: { name: string } | null
  spawnChance: number | null
  escorts:
    | { boss: { name: string } | null; amount: { count: number | null; chance: number | null }[] | null }[]
    | null
}

export interface RawIntel {
  traders: { name: string; resetTime: string | null }[] | null
  goonReports: { map: { name: string } | null; timestamp: string | null }[] | null
  maps: { name: string; bosses: RawBossSlot[] | null }[] | null
}

export interface IntelCache {
  fetchedAt: number
  intel: Intel
  /** Which upstream served this data — absent on caches written before the fallback existed. */
  source?: DataSource
}

export function readIntelCache(): IntelCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as IntelCache
    if (!parsed.intel) return null
    return parsed
  } catch {
    return null
  }
}

function writeIntelCache(cache: IntelCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // storage full — still works this session
  }
}

// Real open-world traders that actually restock (drop Fence-variants, BTR, etc. handled by keeping only known set)
const TRADER_ORDER = ['Prapor', 'Therapist', 'Fence', 'Skier', 'Peacekeeper', 'Mechanic', 'Ragman', 'Jaeger', 'Ref']

/**
 * Fold one slot's escorts into the running per-boss tally. `amount` is a
 * probability distribution over group sizes, so we keep the range of sizes
 * that can actually turn up (chance > 0) and widen it across duplicate slots.
 */
function mergeEscorts(into: Map<string, BossEscort>, escorts: RawBossSlot['escorts']) {
  for (const e of escorts ?? []) {
    const name = e.boss?.name
    if (!name) continue
    const counts = (e.amount ?? [])
      .filter((a) => a.count != null && (a.chance ?? 0) > 0)
      .map((a) => a.count!)
    if (counts.length === 0) continue
    const min = Math.min(...counts)
    const max = Math.max(...counts)
    if (max === 0) continue
    const prev = into.get(name)
    into.set(name, prev ? { name, min: Math.min(prev.min, min), max: Math.max(prev.max, max) } : { name, min, max })
  }
}

function normalize(raw: RawIntel): Intel {
  const traderResets = (raw.traders ?? [])
    .filter((t) => t.resetTime && TRADER_ORDER.includes(t.name))
    .map((t) => ({ name: t.name, resetAt: new Date(t.resetTime!).getTime() }))
    .sort((a, b) => TRADER_ORDER.indexOf(a.name) - TRADER_ORDER.indexOf(b.name))

  const goonReports = (raw.goonReports ?? [])
    .filter((g) => g.map?.name && g.timestamp)
    .map((g) => ({ map: g.map!.name, seenAt: Number(g.timestamp) }))
    .sort((a, b) => b.seenAt - a.seenAt)

  const bossSpawns = (raw.maps ?? [])
    .map((m) => {
      // dedupe boss slots, keep the max spawn chance per named boss
      const byName = new Map<string, { chance: number; escorts: Map<string, BossEscort> }>()
      for (const b of m.bosses ?? []) {
        const name = b.boss?.name
        if (!name || b.spawnChance == null) continue
        const entry = byName.get(name) ?? { chance: 0, escorts: new Map() }
        entry.chance = Math.max(entry.chance, b.spawnChance)
        mergeEscorts(entry.escorts, b.escorts)
        byName.set(name, entry)
      }
      return {
        map: m.name,
        bosses: [...byName.entries()]
          .map(([name, { chance, escorts }]) => ({ name, chance, escorts: [...escorts.values()] }))
          .sort((a, b) => b.chance - a.chance),
      }
    })
    .filter((m) => m.bosses.length > 0)
    .sort((a, b) => a.map.localeCompare(b.map))

  return { traderResets, goonReports, bossSpawns }
}

async function fetchIntelGraphql(): Promise<RawIntel> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: INTEL_QUERY }),
    // without a deadline a hung VPS never fails, so the fallback never runs
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`tarkov.dev API returned ${res.status}`)
  const json = await res.json()
  const data: RawIntel | undefined = json?.data
  if (!data) throw new Error('tarkov.dev API returned no intel')
  return data
}

export async function fetchIntel(): Promise<IntelCache> {
  let gqlError: unknown
  if (!forceJson()) {
    try {
      const cache = { fetchedAt: Date.now(), intel: normalize(await fetchIntelGraphql()), source: 'graphql' as const }
      writeIntelCache(cache)
      return cache
    } catch (e) {
      gqlError = e
    }
  }
  try {
    const cache = { fetchedAt: Date.now(), intel: normalize(await intelFromJson()), source: 'json' as const }
    writeIntelCache(cache)
    return cache
  } catch (jsonError) {
    throw new Error(`intel unavailable — graphql: ${describe(gqlError)}; json: ${describe(jsonError)}`)
  }
}
