import type { QuestObjective } from '../types'
import { objectiveTarget } from '../data/progress'

interface Props {
  objective: QuestObjective
  value: number
  /** Quest marked done — every objective reads complete and locks. */
  questDone: boolean
  onChange: (objectiveId: string, value: number) => void
}

/**
 * "This objective is done" toggle. Ticking fills the count, so it stays in sync
 * with the stepper on multi-count objectives without either holding local state.
 *
 * Locked while the quest is done: done-ness is derived rather than stored, so a
 * click would write 0 — wiping real progress while the box stayed ticked.
 */
export function ObjectiveCheck({ objective: o, value, questDone, onChange }: Props) {
  const target = objectiveTarget(o)
  return (
    <input
      type="checkbox"
      className="obj-check"
      checked={questDone || value >= target}
      disabled={questDone}
      title={questDone ? 'Quest is marked done — untick "Mark done" to edit objectives' : 'Mark complete'}
      aria-label={`Complete: ${o.description}`}
      onChange={(e) => onChange(o.id, e.target.checked ? target : 0)}
    />
  )
}
