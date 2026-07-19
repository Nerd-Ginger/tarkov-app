import type { Profile, Quest } from '../types'

/**
 * Traders you don't start with — their tasks shouldn't show until you've
 * actually got access to them.
 *
 * Jaeger and Ref are granted by a quest, and the API says which one
 * (finishRewards.traderUnlock), so completing it unlocks them automatically.
 * Nothing in the API grants Lightkeeper — his tasks only carry ordinary
 * prerequisites, and those can be satisfied without ever reaching him (Simple
 * Side Job hangs off the BTR Driver line, which never touches the Lighthouse
 * chain). So he's the one trader the user has to confirm by hand.
 */
export const GATED_TRADERS = ['Jaeger', 'Ref', 'Lightkeeper'] as const

/** Traders unlocked by a quest the user has completed. */
export function questUnlockedTraders(quests: Quest[], done: Set<string>): Set<string> {
  const unlocked = new Set<string>()
  for (const q of quests) {
    if (!done.has(q.id)) continue
    for (const t of q.rewardTraderUnlocks) unlocked.add(t)
  }
  return unlocked
}

/** Gated traders the user can't reach yet — their quests stay hidden. */
export function lockedTraders(quests: Quest[], done: Set<string>, profile: Profile): Set<string> {
  const byQuest = questUnlockedTraders(quests, done)
  return new Set(
    GATED_TRADERS.filter((t) => !byQuest.has(t) && profile.unlockedTraders[t] !== true),
  )
}

/**
 * The quest that grants this trader, if the data names one. Null for
 * Lightkeeper, whose unlock isn't expressed anywhere in the task graph.
 */
export function unlockQuestFor(quests: Quest[], trader: string): Quest | null {
  return quests.find((q) => q.rewardTraderUnlocks.includes(trader)) ?? null
}
