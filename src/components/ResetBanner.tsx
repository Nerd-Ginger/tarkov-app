import { useEffect, useState } from 'react'
import type { TraderReset } from '../types'
import { countdown } from '../data/timeFormat'

/** Live trader restock countdowns. Ticks every 30s — countdowns are minute-grained. */
export function ResetBanner({ resets }: { resets: TraderReset[] }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  if (resets.length === 0) return null
  return (
    <div className="reset-banner">
      <span className="reset-label">Trader restock</span>
      {resets.map((r) => {
        const soon = r.resetAt - Date.now() < 30 * 60 * 1000
        return (
          <span key={r.name} className={`reset-chip ${soon ? 'soon' : ''}`}>
            {r.name} <strong>{countdown(r.resetAt)}</strong>
          </span>
        )
      })}
    </div>
  )
}
