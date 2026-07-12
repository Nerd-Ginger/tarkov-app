import type { ObjectiveCategory, Quest } from './types'

export interface Filters {
  maps: Set<string>
  cats: Set<ObjectiveCategory>
  trader: string
  kappaOnly: boolean
  hideDone: boolean
  /** When false (default), Arena questline quests are hidden entirely. */
  showArena: boolean
  level: string
  search: string
}

export const EMPTY_FILTERS: Filters = {
  maps: new Set(),
  cats: new Set(),
  trader: '',
  kappaOnly: false,
  hideDone: false,
  showArena: false,
  level: '',
  search: '',
}

/** Every filter except map selection — the maps section applies this per map row. */
export function matchesNonMap(q: Quest, f: Filters): boolean {
  if (f.trader && q.trader !== f.trader) return false
  if (f.kappaOnly && !q.kappa) return false
  const level = Number.parseInt(f.level, 10)
  if (!Number.isNaN(level) && q.minLevel > level) return false
  if (f.cats.size > 0 && !q.categories.some((c) => f.cats.has(c))) return false
  if (f.search && !q.name.toLowerCase().includes(f.search.toLowerCase())) return false
  return true
}

export function matchesAll(q: Quest, f: Filters): boolean {
  if (!matchesNonMap(q, f)) return false
  if (f.maps.size > 0 && !q.maps.some((m) => f.maps.has(m))) return false
  return true
}
