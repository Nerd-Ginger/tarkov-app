import type { Quest } from '../types'
import { isBlocked } from '../filters'
import { questProgress } from './progress'
import type { QuestProgress } from '../hooks/useQuestProgress'

/** A quest matches when no maps are selected, or one of its maps is selected. */
function matchesMap(q: Quest, maps: Set<string>): boolean {
  return maps.size === 0 || q.maps.some((m) => maps.has(m))
}

export interface BestQuest {
  quest: Quest
  /** Not-yet-done quests DIRECTLY gated on this one (the next tier). */
  unblocks: number
  /** Those direct dependents, sorted by trader/level/name. */
  unlocked: Quest[]
  /** Not-yet-done quests anywhere down the chain behind this one. */
  chainTotal: number
  /** 0–1 tracked completion of this quest's own objectives. */
  progressFraction: number
}

/**
 * "Best Quests" = the quests you can do RIGHT NOW (not done, not locked) with
 * the most quests waiting directly behind them. Ranked by next-tier unblocks;
 * when the user is tracking a quest's progress, a more-complete quest wins the
 * tie so you finish what you've started. The full-chain total is informational.
 */
export function bestQuests(
  quests: Quest[],
  done: Set<string>,
  progress: QuestProgress,
  maps: Set<string>,
  topN = 10,
): BestQuest[] {
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

  // Dependents are built from every quest above, so unblock counts stay accurate;
  // the map filter only limits which quests are shown as candidates.
  const candidates = quests.filter((q) => !done.has(q.id) && !isBlocked(q, done) && matchesMap(q, maps))

  const scored = candidates.map((quest) => {
    const direct = dependents.get(quest.id) ?? []
    const unlocked = direct.filter((id) => !done.has(id)).map((id) => byId.get(id)!)
    unlocked.sort(
      (a, b) => a.trader.localeCompare(b.trader) || a.minLevel - b.minLevel || a.name.localeCompare(b.name),
    )

    // full transitive chain for the secondary number
    const seen = new Set<string>()
    const stack = [...direct]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      const next = dependents.get(id)
      if (next) stack.push(...next)
    }
    let chainTotal = 0
    for (const id of seen) if (!done.has(id)) chainTotal++

    return {
      quest,
      unblocks: unlocked.length,
      unlocked,
      chainTotal,
      progressFraction: questProgress(quest, progress).fraction,
    }
  })

  scored.sort(
    (a, b) =>
      b.unblocks - a.unblocks ||
      b.progressFraction - a.progressFraction ||
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
export function bestRewardQuests(
  quests: Quest[],
  done: Set<string>,
  maps: Set<string>,
  topN = 10,
): RewardQuest[] {
  const candidates = quests.filter((q) => !done.has(q.id) && !isBlocked(q, done) && matchesMap(q, maps))
  const scored = candidates.map((quest) => ({
    quest,
    xp: quest.xp,
    roubles: quest.rewardItems.find((r) => r.item.id === ROUBLES_ID)?.count ?? 0,
  }))
  scored.sort((a, b) => b.xp - a.xp || b.roubles - a.roubles || a.quest.name.localeCompare(b.quest.name))
  return scored.slice(0, topN)
}
