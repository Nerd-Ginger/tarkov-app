import type { Intel } from '../types'

const API_URL = 'https://api.tarkov.dev/graphql'
const CACHE_KEY = 'tarkov.intel.v1'
export const INTEL_MAX_AGE_MS = 10 * 60 * 1000 // 10 min — goon reports move; resets are absolute

const INTEL_QUERY = `{
  traders(gameMode: pve) { name resetTime }
  goonReports { map { name } timestamp }
  maps(gameMode: pve) { name bosses { boss { name } spawnChance } }
}`

interface RawIntel {
  traders: { name: string; resetTime: string | null }[] | null
  goonReports: { map: { name: string } | null; timestamp: string | null }[] | null
  maps: { name: string; bosses: { boss: { name: string } | null; spawnChance: number | null }[] | null }[] | null
}

export interface IntelCache {
  fetchedAt: number
  intel: Intel
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
      const byName = new Map<string, number>()
      for (const b of m.bosses ?? []) {
        const name = b.boss?.name
        if (!name || b.spawnChance == null) continue
        byName.set(name, Math.max(byName.get(name) ?? 0, b.spawnChance))
      }
      return {
        map: m.name,
        bosses: [...byName.entries()]
          .map(([name, chance]) => ({ name, chance }))
          .sort((a, b) => b.chance - a.chance),
      }
    })
    .filter((m) => m.bosses.length > 0)
    .sort((a, b) => a.map.localeCompare(b.map))

  return { traderResets, goonReports, bossSpawns }
}

export async function fetchIntel(): Promise<IntelCache> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: INTEL_QUERY }),
  })
  if (!res.ok) throw new Error(`tarkov.dev API returned ${res.status}`)
  const json = await res.json()
  const data: RawIntel | undefined = json?.data
  if (!data) throw new Error('tarkov.dev API returned no intel')
  const cache = { fetchedAt: Date.now(), intel: normalize(data) }
  writeIntelCache(cache)
  return cache
}
