import type { Quest, QuestObjective } from '../types'
import type { QuestProgress } from '../hooks/useQuestProgress'

export interface QuestProgressSummary {
  /** Non-optional objectives with a count > 1 — the ones you can track partially. */
  trackable: QuestObjective[]
  have: number
  target: number
  /** 0–1 completion across trackable objectives; 0 when nothing is trackable. */
  fraction: number
  /** True once the user has entered any progress for this quest. */
  active: boolean
}

/** An objective supports partial tracking when it's required and needs more than one. */
export function isTrackable(o: QuestObjective): boolean {
  return !o.optional && o.count > 1
}

export function questProgress(quest: Quest, progress: QuestProgress): QuestProgressSummary {
  const trackable = quest.objectives.filter(isTrackable)
  let have = 0
  let target = 0
  let active = false
  for (const o of trackable) {
    const v = progress[o.id] ?? 0
    if (v > 0) active = true
    have += Math.min(v, o.count)
    target += o.count
  }
  return { trackable, have, target, fraction: target > 0 ? have / target : 0, active }
}
