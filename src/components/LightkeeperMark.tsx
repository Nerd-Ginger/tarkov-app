import type { Quest } from '../types'

/**
 * Story marker: a full lantern for Lightkeeper's own questline (the finale),
 * and a dim dot for any quest merely on the path to unlocking him. Nothing for
 * quests unrelated to the Lightkeeper arc.
 */
export function LightkeeperMark({ quest }: { quest: Quest }) {
  if (quest.trader === 'Lightkeeper') {
    return (
      <span className="lk-badge" title="Lightkeeper questline">
        🔦
      </span>
    )
  }
  if (quest.lightkeeper) {
    return (
      <span className="lk-dot" title="On the path to unlock Lightkeeper" aria-label="Lightkeeper path">
        ●
      </span>
    )
  }
  return null
}
