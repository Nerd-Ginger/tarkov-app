import type { PriceRow, TradeItem } from '../types'
import { ROUBLES_ID } from '../api/prices'

/**
 * What a barter or craft costs and what it yields.
 *
 * Extracted from TradeModal, which was the only caller until the Yard Sale
 * table needed the same numbers. Two implementations would drift, and a row
 * claiming one cost while its modal claims another is the kind of bug nobody
 * reports — they just stop trusting the figures.
 */
export interface SideValue {
  total: number
  /**
   * Items with no usable price — flea-banned inputs and unlisted items.
   *
   * Not a rounding error: 46% of barters need at least one flea-banned input,
   * so `total` is a *floor* far more often than it's a figure. Callers must
   * surface that (the table renders "≥ ₽X") rather than presenting the number
   * as complete.
   */
  unpriced: TradeItem[]
}

/** Cost to buy the inputs off the flea (Roubles = face value). */
export function giveCost(items: TradeItem[], prices: Map<string, PriceRow>): SideValue {
  let total = 0
  const unpriced: TradeItem[] = []
  for (const t of items) {
    if (t.item.id === ROUBLES_ID) {
      total += t.count
      continue
    }
    const flea = prices.get(t.item.id)?.flea
    if (t.noFlea || flea == null) unpriced.push(t)
    else total += flea * t.count
  }
  return { total, unpriced }
}

/** What the rewards are worth — flea when sellable, else best trader. */
export function getValue(items: TradeItem[], prices: Map<string, PriceRow>): SideValue {
  let total = 0
  const unpriced: TradeItem[] = []
  for (const t of items) {
    if (t.item.id === ROUBLES_ID) {
      total += t.count
      continue
    }
    const p = prices.get(t.item.id)
    const v = p?.flea ?? (p && p.trader > 0 ? p.trader : null)
    if (v == null) unpriced.push(t)
    else total += v * t.count
  }
  return { total, unpriced }
}
