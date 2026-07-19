import type { PriceRow, Profile } from '../types'
import { traderLoyalty } from '../hooks/useProfile'

/**
 * Pseudo-source used for the flea market in `buyFrom`. It is not a trader:
 * never pass it to traderLoyalty() or the locked-traders set.
 */
export const FLEA = 'Flea'

export interface BuyOffer {
  source: string
  price: number
  minLevel: number
}

export interface BuyOption {
  /** Cheapest offer you can take right now — trader unlocked and loyalty met. */
  best: BuyOffer | null
  /** A strictly cheaper offer sitting above your level, if there is one. */
  lockedCheaper: BuyOffer | null
  /**
   * Cheapest *trader* offer you can take now — flea excluded. Drives both
   * "can buy" and margin: buying on flea to sell on flea is never a trade, so
   * only a trader purchase can produce a real spread.
   */
  traderBest: BuyOffer | null
}

function reachable(o: BuyOffer, profile: Profile, locked: Set<string>): boolean {
  if (o.source === FLEA) return true // no loyalty gate on the flea market
  return !locked.has(o.source) && traderLoyalty(profile, o.source) >= o.minLevel
}

/**
 * What this item costs you today. `buyFrom` is already cheapest-first, so the
 * first reachable offer is the best one and anything ahead of it is a cheaper
 * offer you can't take yet.
 */
export function buyOption(row: PriceRow, profile: Profile, locked: Set<string>): BuyOption {
  let lockedCheaper: BuyOffer | null = null
  let best: BuyOffer | null = null
  for (const o of row.buyFrom) {
    if (reachable(o, profile, locked)) {
      best = o
      break
    }
    if (!lockedCheaper) lockedCheaper = o
  }
  // Asked separately from `best`, which may be a flea offer that undercuts every
  // trader — "can I buy this" has to mean "will a trader sell it to me".
  const traderBest = row.buyFrom.find((o) => o.source !== FLEA && reachable(o, profile, locked)) ?? null
  return { best, lockedCheaper, traderBest }
}

/** Best trader who'll buy it, among traders you've unlocked. Sells aren't loyalty-gated. */
export function sellOption(row: PriceRow, locked: Set<string>): { source: string; price: number } | null {
  return row.sellTo.find((s) => !locked.has(s.source)) ?? null
}

/** Best obtainable sell value per grid slot — the loot-priority signal. */
export function perSlot(row: PriceRow, locked: Set<string>): number {
  return Math.max(row.flea ?? 0, sellOption(row, locked)?.price ?? 0) / row.slots
}
