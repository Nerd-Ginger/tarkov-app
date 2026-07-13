import type { Quest } from '../types'
import { isBlocked } from '../filters'

export interface BestQuest {
  quest: Quest
  /** Not-yet-done quests DIRECTLY gated on this one (next tier only, not the whole chain). */
  unblocks: number
  /** Those direct dependents, sorted by trader/level/name. */
  unlocked: Quest[]
}

/**
 * "Best Quests" = the quests you can do RIGHT NOW (not done, not locked) with
 * the most quests waiting directly behind them — the next tier of the tree,
 * not the full transitive chain.
 */
export function bestQuests(quests: Quest[], done: Set<string>, topN = 5): BestQuest[] {
  const byId = new Map(quests.map((q) => [q.id, q]))

  // prereq -> direct dependents (blocking edges only, within the visible set)
  const dependents = new Map<string, string[]>()
  for (const q of quests) {
    for (const p of q.blockingRequires) {
      if (!byId.has(p)) continue
      let list = dependents.get(p)
      if (!list) dependents.set(p, (list = []))
      list.push(q.id)
    }
  }

  const candidates = quests.filter((q) => !done.has(q.id) && !isBlocked(q, done))

  const scored = candidates.map((quest) => {
    const unlocked = (dependents.get(quest.id) ?? [])
      .filter((id) => !done.has(id))
      .map((id) => byId.get(id)!)
    unlocked.sort(
      (a, b) => a.trader.localeCompare(b.trader) || a.minLevel - b.minLevel || a.name.localeCompare(b.name),
    )
    return { quest, unblocks: unlocked.length, unlocked }
  })

  scored.sort(
    (a, b) =>
      b.unblocks - a.unblocks ||
      a.quest.minLevel - b.quest.minLevel ||
      a.quest.name.localeCompare(b.quest.name),
  )
  return scored.slice(0, topN)
}

const ROUBLES_ID = '5449016a4bdc2d6f028b456f'

export interface RewardQuest {
  quest: Quest
  xp: number
  roubles: number
}

/**
 * "Best rewards" = the quests you can do RIGHT NOW with the biggest completion
 * payout, ranked by XP (roubles break ties). Reward items ride along for display.
 */
export function bestRewardQuests(quests: Quest[], done: Set<string>, topN = 5): RewardQuest[] {
  const candidates = quests.filter((q) => !done.has(q.id) && !isBlocked(q, done))
  const scored = candidates.map((quest) => ({
    quest,
    xp: quest.xp,
    roubles: quest.rewardItems.find((r) => r.item.id === ROUBLES_ID)?.count ?? 0,
  }))
  scored.sort((a, b) => b.xp - a.xp || b.roubles - a.roubles || a.quest.name.localeCompare(b.quest.name))
  return scored.slice(0, topN)
}
