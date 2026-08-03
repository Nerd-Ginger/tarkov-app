import type { Profile, Quest, QuestTraderReq } from '../types'

/**
 * Requirements that annotate rather than hide.
 *
 * Trader loyalty and standing are hand-maintained numbers that go stale the
 * moment you play, and standing in particular is a decimal the game never shows
 * you precisely. Hiding a quest on a stale number is worse than showing an
 * "unmet" badge next to one you can actually take, so nothing here filters —
 * `isBlocked` still owns that, and only for prerequisites and faction.
 */
export type ReqState = 'met' | 'unmet' | 'unknown'

export interface ReqLine {
  state: ReqState
  /** Rendered as-is, e.g. "Prapor LL2+" or "Fence standing ≥ 6.00". */
  label: string
}

const OPS: Record<string, (a: number, b: number) => boolean> = {
  '>=': (a, b) => a >= b,
  '>': (a, b) => a > b,
  '<=': (a, b) => a <= b,
  '<': (a, b) => a < b,
  '=': (a, b) => a === b,
  '==': (a, b) => a === b,
}

const OP_TEXT: Record<string, string> = {
  '>=': '≥',
  '>': '>',
  '<=': '≤',
  '<': '<',
  '=': '=',
  '==': '=',
}

function label(r: QuestTraderReq): string {
  if (r.kind === 'level') {
    // LL gates are always ">= n" in practice; render the common case readably.
    return r.compare === '>=' ? `${r.trader} LL${r.value}+` : `${r.trader} LL ${OP_TEXT[r.compare] ?? r.compare} ${r.value}`
  }
  return `${r.trader} standing ${OP_TEXT[r.compare] ?? r.compare} ${r.value}`
}

/**
 * Evaluate one trader requirement.
 *
 * Loyalty reads `profile.traders` directly rather than going through
 * `traderLoyalty()`: that helper defaults to LL1, which would report every
 * `>= 2` gate as *unmet* on a fresh profile instead of *unknown*. Standing uses
 * key absence for "unset" for the same reason — 0 is a real value that three
 * Make Amends quests gate on.
 */
export function evalTraderReq(r: QuestTraderReq, profile: Profile): ReqLine {
  const have = r.kind === 'level' ? profile.traders[r.trader] : profile.reputation[r.trader]
  if (typeof have !== 'number') return { state: 'unknown', label: label(r) }
  const op = OPS[r.compare]
  if (!op) return { state: 'unknown', label: label(r) }
  return { state: op(have, r.value) ? 'met' : 'unmet', label: label(r) }
}

export function questReqLines(quest: Quest, profile: Profile): ReqLine[] {
  return quest.traderReqs.map((r) => evalTraderReq(r, profile))
}

/** Requirements worth flagging in a dense table row — unmet only, never unknown. */
export function unmetReqs(quest: Quest, profile: Profile): ReqLine[] {
  return questReqLines(quest, profile).filter((l) => l.state === 'unmet')
}

/**
 * Faction is the one new gate that hides: it's binary, permanent, chosen by the
 * user, and leaving it off shows six impossible quests plus three visible
 * duplicate names. 'Any' opts out entirely.
 */
export function factionAllows(quest: Quest, profile: Profile): boolean {
  return profile.faction === 'Any' || quest.faction === 'Any' || quest.faction === profile.faction
}
