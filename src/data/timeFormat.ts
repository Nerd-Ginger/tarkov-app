/** "2h 14m" until a future epoch ms, "now" if past. */
export function countdown(toMs: number, nowMs: number = Date.now()): string {
  let s = Math.floor((toMs - nowMs) / 1000)
  if (s <= 0) return 'now'
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return '<1m'
}

/** "3h ago" / "12m ago" since a past epoch ms. */
export function ago(fromMs: number, nowMs: number = Date.now()): string {
  const mins = Math.floor((nowMs - fromMs) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/**
 * Craft duration as "3h 20m". Moved here from CraftsView when that view was
 * folded into Yard Sale — this module already owns the other time formatting.
 */
export function duration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
