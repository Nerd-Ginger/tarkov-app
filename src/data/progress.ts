import type { Quest, QuestObjective } from '../types'
import type { QuestProgress } from '../hooks/useQuestProgress'

export interface QuestProgressSummary {
  /** Every required objective — the ones that carry a checkbox and count toward completion. */
  trackable: QuestObjective[]
  have: number
  target: number
  /** 0–1 completion across required objectives; 0 when nothing is required. */
  fraction: number
  /** True once the user has entered any progress for this quest. */
  active: boolean
}

/** An objective supports partial tracking when it's required and needs more than one. */
export function isTrackable(o: QuestObjective): boolean {
  return !o.optional && o.count > 1
}

/** Every required objective gets a checkbox, whether or not it also gets a stepper. */
export function isCheckable(o: QuestObjective): boolean {
  return !o.optional
}

/** Units needed to finish an objective. Single-step objectives report count 0 or 1. */
export function objectiveTarget(o: QuestObjective): number {
  return Math.max(o.count, 1)
}

/**
 * A quest marked done implies all its objectives are done. That's derived here
 * rather than written into the progress store, so un-marking the quest restores
 * whatever partial counts the user had entered instead of wiping them.
 */
export function objectiveComplete(o: QuestObjective, progress: QuestProgress, questDone: boolean): boolean {
  return questDone || (progress[o.id] ?? 0) >= objectiveTarget(o)
}

/**
 * Required objectives that name this map. Objectives with no maps (hand-ins,
 * anywhere-kills) are map-agnostic: they neither block nor enable clearing a map.
 */
export function objectivesForMap(quest: Quest, map: string): QuestObjective[] {
  return quest.objectives.filter((o) => !o.optional && o.maps.includes(map))
}

/**
 * "I no longer need to raid this map for this quest."
 *
 * The empty-list guard is load-bearing: [].every() is true, so without it any
 * quest whose map reached `quest.maps` from somewhere other than a required
 * objective would read as permanently cleared and vanish for good. That covers
 * maps contributed only by optional objectives, the task-level map fallback,
 * and the pseudo-maps ("Any map", "No raid needed", ...) — none of which ever
 * appear on an objective.
 */
export function mapCleared(quest: Quest, map: string, progress: QuestProgress, done: Set<string>): boolean {
  const forMap = objectivesForMap(quest, map)
  if (forMap.length === 0) return false
  const questDone = done.has(quest.id)
  return forMap.every((o) => objectiveComplete(o, progress, questDone))
}

/** Map-filter predicate: does this quest still need work on any of the selected maps? */
export function matchesMapNeeded(
  quest: Quest,
  maps: Set<string>,
  progress: QuestProgress,
  done: Set<string>,
): boolean {
  if (maps.size === 0) return true
  return quest.maps.some((m) => maps.has(m) && !mapCleared(quest, m, progress, done))
}

export function questProgress(quest: Quest, progress: QuestProgress, done?: Set<string>): QuestProgressSummary {
  const counted = quest.objectives.filter(isCheckable)
  const questDone = done?.has(quest.id) ?? false
  let have = 0
  let target = 0
  let active = false
  for (const o of counted) {
    const t = objectiveTarget(o)
    const v = questDone ? t : Math.min(progress[o.id] ?? 0, t)
    if (!questDone && v > 0) active = true
    have += v
    target += t
  }
  return { trackable: counted, have, target, fraction: target > 0 ? have / target : 0, active }
}
