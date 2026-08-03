import type { ObjectiveCategory, Quest, QuestPrereq } from './types'
import type { QuestProgress } from './hooks/useQuestProgress'
import { matchesMapNeeded } from './data/progress'

/** Completion state the map filter needs to know "am I done with this map?". */
export interface MapProgressCtx {
  progress: QuestProgress
  done: Set<string>
}

export interface Filters {
  maps: Set<string>
  cats: Set<ObjectiveCategory>
  trader: string
  kappaOnly: boolean
  hideDone: boolean
  /** Hide quests still locked behind an unfinished prerequisite. */
  hideBlocked: boolean
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
  // on by default: a quest locked behind an unfinished prerequisite looks
  // identical to an available one in the list, which reads as a bug. Best
  // Quests has always excluded them; this makes the list agree.
  hideBlocked: true,
  showArena: false,
  level: '',
  search: '',
}

/** What a prerequisite is judged against. */
export interface QuestGateCtx {
  done: Set<string>
  active: Set<string>
  failed: Set<string>
}

/**
 * A requirement's status array is a disjunction — the gate opens when the
 * prereq is in ANY of the listed states.
 *
 * `complete` satisfies an `active` gate. Finishing a quest means it *was*
 * active, and without this rule completing a prerequisite would suddenly HIDE
 * the quest it unlocks — a worse bug than the one this fixes.
 */
export function prereqMet(p: QuestPrereq, ctx: QuestGateCtx): boolean {
  return p.status.some(
    (s) =>
      (s === 'complete' && ctx.done.has(p.id)) ||
      (s === 'active' && (ctx.active.has(p.id) || ctx.done.has(p.id))) ||
      (s === 'failed' && ctx.failed.has(p.id)),
  )
}

/** Only satisfiable by failing the prereq — never blocking, since failure tracking is opt-in. */
function failedOnly(p: QuestPrereq): boolean {
  return p.status.every((s) => s === 'failed')
}

/**
 * A quest is blocked when a prerequisite isn't in a state that satisfies it.
 * Chains resolve naturally: if A gates B gates C and A is undone, B is undone
 * too, so C stays blocked.
 *
 * Fail-only prereqs never block — a user who hasn't discovered the failed
 * toggle must not silently lose quests.
 */
export function isBlocked(q: Quest, ctx: QuestGateCtx): boolean {
  return q.prereqs.some((p) => !failedOnly(p) && !prereqMet(p, ctx))
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

export function matchesAll(q: Quest, f: Filters, ctx: MapProgressCtx): boolean {
  if (!matchesNonMap(q, f)) return false
  return matchesMapNeeded(q, f.maps, ctx.progress, ctx.done)
}
