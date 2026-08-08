import type { Barter, Craft, ItemRef, PriceRow, Profile } from '../types'
import type { ItemUsage } from './itemUsage'
import { FLEA, buyOption, perSlot, sellOption } from './tradeAccess'
import { giveCost } from './tradeValue'
import { traderLoyalty } from '../hooks/useProfile'

/**
 * One item, every way to get it.
 *
 * Replaces three views that each answered part of the question: Barter and
 * Crafts listed *recipes* grouped by provider, Fire Sale listed *items* with
 * prices. Neither could tell you "what's the cheapest way to get this, and is
 * it worth flipping" without holding two tabs in your head.
 *
 * Every barter and craft in the game rewards exactly one distinct item (checked
 * against the live data: 0 of 789 and 0 of 214), so a recipe maps to exactly one
 * row and nothing needs apportioning between outputs.
 */

/**
 * `cost` is per unit of the item, not per trade — 100 of 214 crafts reward more
 * than one (a 200-round ammo craft would otherwise look like the most expensive
 * way in the game to get one bullet).
 *
 * `cost: null` means nothing in the recipe could be priced at all. That is NOT
 * free: rendering it as ₽0 would float those rows to the top of a cheapest-first
 * sort, which is the opposite of the truth.
 */
export type Acquisition =
  | {
      kind: 'buy'
      cost: number
      atLeast: false
      source: string
      minLevel: number
      gated: boolean
      count: 1
      tradeCost: number
    }
  | { kind: 'barter'; cost: number | null; atLeast: boolean; barter: Barter; gated: boolean; count: number; tradeCost: number }
  | { kind: 'craft'; cost: number | null; atLeast: boolean; craft: Craft; gated: boolean; count: number; tradeCost: number }

export interface YardSaleRow {
  item: ItemRef
  /** Absent for the 19 barter/craft outputs the price API doesn't list. */
  price: PriceRow | null
  acquisitions: Acquisition[]
  /** Cheapest route you can actually take, or null if every route is gated. */
  best: Acquisition | null
  sell: { source: string; price: number } | null
  flea: number | null
  change48h: number | null
  /** Best sell minus best ungated cost. Null when either side is unknown. */
  margin: number | null
  perSlot: number
  noFlea: boolean
}

export interface YardSaleInput {
  priceRows: PriceRow[]
  usage: Map<string, ItemUsage>
  pricesById: Map<string, PriceRow>
  profile: Profile
  locked: Set<string>
  /** Built hideout levels, keyed `${stationId}:${level}`. */
  built: Set<string>
  done: Set<string>
}

/** Highest built level per station, from the `${stationId}:${level}` key set. */
function maxBuilt(built: Set<string>): Map<string, number> {
  const m = new Map<string, number>()
  for (const key of built) {
    const i = key.lastIndexOf(':')
    if (i < 0) continue
    const id = key.slice(0, i)
    const lvl = Number(key.slice(i + 1))
    if (!Number.isFinite(lvl)) continue
    m.set(id, Math.max(m.get(id) ?? 0, lvl))
  }
  return m
}

/**
 * Pick the headline route.
 *
 * Ungated always beats gated — a cheaper thing you can't buy isn't an option.
 * Within that, cheapest wins, but a *complete* price beats an equal floor:
 * 46% of barters need a flea-banned input, so their cost is a lower bound, and
 * ranking a bound above a real figure it might actually exceed would quietly
 * mislead. Ties go to the honest number.
 */
function better(a: Acquisition, b: Acquisition): Acquisition {
  if (a.gated !== b.gated) return a.gated ? b : a
  // an unpriceable route can't be the cheapest — it's unknown, not free
  if ((a.cost == null) !== (b.cost == null)) return a.cost == null ? b : a
  if (a.cost != null && b.cost != null && a.cost !== b.cost) return a.cost < b.cost ? a : b
  if (a.atLeast !== b.atLeast) return a.atLeast ? b : a
  return a
}

export function buildYardSale(input: YardSaleInput): YardSaleRow[] {
  const { priceRows, usage, pricesById, profile, locked, built, done } = input
  const stationLevels = maxBuilt(built)

  // The row universe is the UNION of priced items and barter/craft outputs.
  // Starting from prices alone drops 19 obtainable items, and they're not
  // obscure — Secure container Theta, Data from Fence's laptop.
  const items = new Map<string, ItemRef>()
  for (const p of priceRows) items.set(p.id, { id: p.id, name: p.name, shortName: p.shortName })
  for (const [id, u] of usage) {
    if (items.has(id)) continue
    if (u.barterOutputs.length === 0 && u.craftOutputs.length === 0) continue
    const ref =
      u.barterOutputs.flatMap((b) => b.reward).find((r) => r.item.id === id)?.item ??
      u.craftOutputs.flatMap((c) => c.reward).find((r) => r.item.id === id)?.item
    if (ref) items.set(id, ref)
  }

  const rows: YardSaleRow[] = []
  for (const [id, item] of items) {
    const price = pricesById.get(id) ?? null
    const u = usage.get(id)
    const acquisitions: Acquisition[] = []

    if (price) {
      const buy = buyOption(price, profile, locked)
      // `best` may be a flea offer; `lockedCheaper` is a trader offer above your
      // level. Show whichever exists, marking the unreachable one as gated.
      const offer = buy.best ?? buy.lockedCheaper
      if (offer) {
        acquisitions.push({
          kind: 'buy',
          cost: offer.price,
          atLeast: false,
          source: offer.source,
          minLevel: offer.minLevel,
          gated: buy.best === null,
          count: 1,
          tradeCost: offer.price,
        })
      }
    }

    // A recipe whose inputs are entirely unpriceable reports total 0 — that's
    // "unknown", not "free", so it becomes null rather than sorting as cheapest.
    const unitCost = (total: number, unpriced: number, count: number) =>
      total === 0 && unpriced > 0 ? null : total / Math.max(count, 1)

    for (const b of u?.barterOutputs ?? []) {
      const c = giveCost(b.required, pricesById)
      const count = b.reward.find((r) => r.item.id === id)?.count ?? 1
      acquisitions.push({
        kind: 'barter',
        cost: unitCost(c.total, c.unpriced.length, count),
        atLeast: c.unpriced.length > 0,
        barter: b,
        count,
        tradeCost: c.total,
        gated:
          traderLoyalty(profile, b.trader) < b.level ||
          locked.has(b.trader) ||
          (!!b.unlockQuest && !done.has(b.unlockQuest.id)),
      })
    }

    for (const cr of u?.craftOutputs ?? []) {
      const c = giveCost(cr.required, pricesById)
      const count = cr.reward.find((r) => r.item.id === id)?.count ?? 1
      acquisitions.push({
        kind: 'craft',
        cost: unitCost(c.total, c.unpriced.length, count),
        atLeast: c.unpriced.length > 0,
        craft: cr,
        count,
        tradeCost: c.total,
        gated: (stationLevels.get(cr.stationId) ?? 0) < cr.level,
      })
    }

    const best = acquisitions.length > 0 ? acquisitions.reduce(better) : null
    const sell = price ? sellOption(price, locked) : null
    const bestSell = Math.max(price?.flea ?? 0, sell?.price ?? 0)
    /**
     * Margin ignores buying on the flea, matching what Fire Sale did: flea-to-flea
     * is never a trade. A barter or craft IS a real trade even though its cost is
     * derived from flea input prices — you're converting cheap items into a dear
     * one — so those count.
     */
    const tradeRoute = acquisitions
      .filter((a) => !a.gated && a.cost != null && !(a.kind === 'buy' && a.source === FLEA))
      .reduce<Acquisition | null>((acc, a) => (acc === null ? a : better(acc, a)), null)
    const margin =
      tradeRoute && tradeRoute.cost != null && bestSell > 0 ? bestSell - tradeRoute.cost : null

    rows.push({
      item,
      price,
      acquisitions,
      best,
      sell,
      flea: price?.flea ?? null,
      change48h: price?.change48h ?? null,
      margin,
      perSlot: price ? perSlot(price, locked) : 0,
      noFlea: price?.noFlea ?? false,
    })
  }
  return rows
}

/** Trader and station names that appear as an acquisition source, for the filter chips. */
export function yardSaleSources(rows: YardSaleRow[]): string[] {
  const s = new Set<string>()
  for (const r of rows) {
    for (const a of r.acquisitions) {
      if (a.kind === 'buy' && a.source !== FLEA) s.add(a.source)
      if (a.kind === 'barter') s.add(a.barter.trader)
      if (a.kind === 'craft') s.add(a.craft.station)
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b))
}

/** The source name an acquisition is filed under — trader for buy/barter, station for craft. */
export function acquisitionSource(a: Acquisition): string {
  if (a.kind === 'buy') return a.source
  if (a.kind === 'barter') return a.barter.trader
  return a.craft.station
}
