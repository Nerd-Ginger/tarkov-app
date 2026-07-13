import type { QuestObjective } from '../types'

interface Props {
  objective: QuestObjective
  value: number
  onChange: (objectiveId: string, value: number) => void
}

/** Compact "have / count" stepper for a countable objective. */
export function ObjectiveStepper({ objective: o, value, onChange }: Props) {
  const v = Math.min(Math.max(value, 0), o.count)
  const set = (n: number) => onChange(o.id, Math.min(Math.max(n, 0), o.count))
  return (
    <span className={`obj-stepper ${v >= o.count ? 'complete' : ''}`}>
      <button className="obj-step" onClick={() => set(v - 1)} disabled={v <= 0} aria-label="Decrease">
        −
      </button>
      <input
        type="number"
        min={0}
        max={o.count}
        value={v}
        onChange={(e) => set(Number.parseInt(e.target.value, 10) || 0)}
        aria-label="Progress"
      />
      <span className="obj-target">/ {o.count}</span>
      <button className="obj-step" onClick={() => set(v + 1)} disabled={v >= o.count} aria-label="Increase">
        +
      </button>
    </span>
  )
}
