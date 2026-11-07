import type { Barter, Craft, PriceRow, Profile, RawMap } from '../types'
import type { ItemUsage } from './itemUsage'
import { FLEA } from './tradeAccess'
import { buildYardSale } from './yardSale'
import { traderLoyalty } from '../hooks/useProfile'

/**
 * Hideout running costs: generator fuel, the bitcoin farm, air filters.
 *
 * The API ships the item side (resource units, prices, the BTC craft's base
 * duration, station bonuses) but not the burn rates or the skill's effect, so
 * those are game constants here. They match tarkov.dev's own bitcoin farm
 * calculator (src/pages/bitcoin-farm-calculator/data.js) and the wiki.
 *
 * What does NOT feed in, despite looking like it should: generator level
 * (fuel burn is flat at every level — it only gates Farm 2) and player level
 * (no effect on burn — it only gates the flea market).
 */

export const ITEM = {
  metalFuel: '5d1b36a186f7742523398433',
  expeditionaryFuel: '5d1b371186f774253763a656',
  filter: '5d1b2f3f86f774252167a52c',
  gpu: '57347ca924597744596b4e71',
  bitcoin: '59faff1d86f7746c51718c9c',
} as const

export const STATION = {
  generator: '5d3b396e33c48f02b81cd9f3',
  bitcoinFarm: '5d494a445b56502f18c98a10',
  solarPower: '5d494a385b56502f18c98a0c',
  airFilteringUnit: '5d494a315b56502f18c98a0a',
} as const

export interface FuelType {
  id: string
  name: string
  units: number
}

/** Both tanks burn at the same rate: 100u in 75 789 s, 60u in 45 473 s. */
export const FUEL_TYPES: FuelType[] = [
  { id: ITEM.metalFuel, name: 'Metal fuel tank', units: 100 },
  { id: ITEM.expeditionaryFuel, name: 'Expeditionary fuel tank', units: 60 },
]
const FUEL_UNITS_PER_HOUR = (100 / 75_789) * 3600

/** One FP-100 (300u) lasts 17h 38m 49s untrained — 23h 31m 45s at elite, i.e. the same −25% cap. */
const FILTER_BASE_HOURS = 63_529 / 3600
/** API bonus on the Air Filtering Unit: SkillGroupLevelingBoost 0.4 on Physical. */
export const FILTER_PHYSICAL_BOOST = 0.4

/** API bonus on Solar Power: FuelConsumption −0.5. */
const SOLAR_FACTOR = 0.5
/** Hideout Management: 0.5% less fuel and filter burn per level, capped at 25%. */
const HM_PER_LEVEL = 0.005
const HM_CAP = 0.25

/** BTC craft time divides by 1 + (GPUs − 1) × this. */
const GPU_BOOST = 0.041225
/** Used only if the craft is missing from the data — the API's current value. */
export const BTC_FALLBACK_SEC = 300_000
/** GPU slots per farm level, from the farm's AdditionalSlots bonuses. */
const FARM_GPU_CAP = [0, 10, 25, 50]
/** fleaMarket.minPlayerLevel in the items payload. */
export const FLEA_MIN_LEVEL = 15

/** Highest built level of one station, from the `${stationId}:${level}` key set. */
export function builtLevel(built: Set<string>, stationId: string): number {
  let max = 0
  for (const key of built) {
    if (!key.startsWith(`${stationId}:`)) continue
    const lvl = Number(key.slice(stationId.length + 1))
    if (Number.isFinite(lvl)) max = Math.max(max, lvl)
  }
  return max
}

export function farmGpuCap(farmLevel: number): number {
  return FARM_GPU_CAP[Math.min(Math.max(farmLevel, 0), 3)]
}

/** Fraction of base burn left after the skill. */
export function skillFactor(hm: number): number {
  return 1 - Math.min(HM_PER_LEVEL * hm, HM_CAP)
}

export function fuelUnitsPerHour(hm: number, solar: boolean): number {
  return FUEL_UNITS_PER_HOUR * skillFactor(hm) * (solar ? SOLAR_FACTOR : 1)
}

export function hoursPerBtc(gpus: number, craftSec: number): number {
  if (gpus < 1) return Infinity
  return craftSec / (1 + (gpus - 1) * GPU_BOOST) / 3600
}

export function filterHours(hm: number): number {
  return FILTER_BASE_HOURS / skillFactor(hm)
}

/** Base BTC craft duration from the data, or the fallback if it's missing. */
export function btcCraftSec(crafts: Craft[]): number {
  const c = crafts.find((c) => c.stationId === STATION.bitcoinFarm && c.reward.some((r) => r.item.id === ITEM.bitcoin))
  return c?.durationSec || BTC_FALLBACK_SEC
}

// ---- routes: every way to get one of the item ----

export type Route =
  | { kind: 'trader'; label: string; cost: number; atLeast: false; gated: boolean; why: string }
  | { kind: 'flea'; label: string; cost: number; atLeast: false; gated: boolean; why: string }
  | { kind: 'barter'; label: string; cost: number | null; atLeast: boolean; gated: boolean; why: string; barter: Barter }
  | { kind: 'craft'; label: string; cost: number | null; atLeast: boolean; gated: boolean; why: string; craft: Craft }

export interface RouteContext {
  pricesById: Map<string, PriceRow>
  usage: Map<string, ItemUsage>
  profile: Profile
  locked: Set<string>
  built: Set<string>
  done: Set<string>
}

/** pmcLevel 0 is "unset" — don't gate on a level nobody entered (same as Best Quests). */
export function fleaGated(profile: Profile): boolean {
  return profile.pmcLevel > 0 && profile.pmcLevel < FLEA_MIN_LEVEL
}

/**
 * Unlike Yard Sale, which folds buying into one best offer, this keeps trader
 * and flea apart — "trader vs flea" is the question here. Barters and crafts
 * come from buildYardSale, run over just this item, so their pricing and gating
 * stay defined in one place.
 */
export function itemRoutes(id: string, ctx: RouteContext): Route[] {
  const routes: Route[] = []
  const price = ctx.pricesById.get(id)
  for (const o of price?.buyFrom ?? []) {
    if (o.source === FLEA) {
      const gated = fleaGated(ctx.profile)
      routes.push({
        kind: 'flea',
        label: 'Flea',
        cost: o.price,
        atLeast: false,
        gated,
        why: gated ? `flea unlocks at level ${FLEA_MIN_LEVEL}` : '',
      })
      continue
    }
    const locked = ctx.locked.has(o.source)
    const short = traderLoyalty(ctx.profile, o.source) < o.minLevel
    routes.push({
      kind: 'trader',
      label: `${o.source} LL${o.minLevel}`,
      cost: o.price,
      atLeast: false,
      gated: locked || short,
      why: locked ? `${o.source} locked` : short ? `needs ${o.source} LL${o.minLevel}` : '',
    })
  }

  const u = ctx.usage.get(id)
  if (u) {
    const [row] = buildYardSale({
      priceRows: price ? [price] : [],
      usage: new Map([[id, u]]),
      pricesById: ctx.pricesById,
      profile: ctx.profile,
      locked: ctx.locked,
      built: ctx.built,
      done: ctx.done,
    })
    for (const a of row?.acquisitions ?? []) {
      if (a.kind === 'barter') {
        routes.push({
          kind: 'barter',
          label: `${a.barter.trader} LL${a.barter.level}`,
          cost: a.cost,
          atLeast: a.atLeast,
          gated: a.gated,
          why: a.gated ? (a.barter.unlockQuest && !ctx.done.has(a.barter.unlockQuest.id) ? `needs ${a.barter.unlockQuest.name}` : `needs ${a.barter.trader} LL${a.barter.level}`) : '',
          barter: a.barter,
        })
      } else if (a.kind === 'craft') {
        routes.push({
          kind: 'craft',
          label: `${a.craft.station} ${a.craft.level}`,
          cost: a.cost,
          atLeast: a.atLeast,
          gated: a.gated,
          why: a.gated ? `needs ${a.craft.station} ${a.craft.level}` : '',
          craft: a.craft,
        })
      }
    }
  }

  // ungated first, then cheapest; unpriceable routes sink — unknown isn't free
  return routes.sort(
    (a, b) =>
      Number(a.gated) - Number(b.gated) ||
      Number(a.cost == null) - Number(b.cost == null) ||
      (a.cost ?? 0) - (b.cost ?? 0),
  )
}

/** Cheapest route you can take today, with a real (non-floor) price if one exists. */
export function cheapest(routes: Route[]): Route | null {
  const open = routes.filter((r) => !r.gated && r.cost != null)
  return open.find((r) => !r.atLeast) ?? open[0] ?? null
}

// ---- the farm ----

export interface FarmEconomics {
  hoursPerBtc: number
  btcPerDay: number
  revenuePerDay: number
  fuelPerDay: number
  netPerDay: number
  /** Extra ₽/day the next GPU adds (fuel doesn't change with GPU count). */
  nextGpuPerDay: number | null
  /** Cost of the GPUs still missing to reach the cap. */
  fillCost: number | null
  /** Days of extra revenue to pay that fill cost back. */
  paybackDays: number | null
}

export function farmEconomics(opts: {
  gpus: number
  cap: number
  craftSec: number
  btcSell: number
  fuelPerHourCost: number
  gpuCost: number | null
}): FarmEconomics {
  const { gpus, cap, craftSec, btcSell, fuelPerHourCost, gpuCost } = opts
  const perDay = (n: number) => (n < 1 ? 0 : 24 / hoursPerBtc(n, craftSec))
  const btcPerDay = perDay(gpus)
  const revenuePerDay = btcPerDay * btcSell
  const fuelPerDay = fuelPerHourCost * 24
  const missing = Math.max(cap - gpus, 0)
  const fillCost = missing > 0 && gpuCost != null ? missing * gpuCost : missing === 0 ? 0 : null
  const gain = (perDay(cap) - btcPerDay) * btcSell
  return {
    hoursPerBtc: hoursPerBtc(gpus, craftSec),
    btcPerDay,
    revenuePerDay,
    fuelPerDay,
    netPerDay: revenuePerDay - fuelPerDay,
    nextGpuPerDay: gpus < cap ? (perDay(gpus + 1) - btcPerDay) * btcSell : null,
    fillCost,
    paybackDays: fillCost != null && fillCost > 0 && gain > 0 ? fillCost / gain : null,
  }
}

// ---- where to find it ----

export interface MapCount {
  map: string
  count: number
  /** The variant the count came from, for reading its other counts. */
  source: RawMap
}

/**
 * Spawn counts per map, most first. Map display names alias many-to-one
 * (Night Factory, the GZ variants), so the busiest variant stands for the name.
 */
export function countsByMap(maps: RawMap[], pick: (m: RawMap) => number): MapCount[] {
  const best = new Map<string, MapCount>()
  for (const m of maps) {
    const n = pick(m)
    if (n > 0 && n > (best.get(m.name)?.count ?? 0)) best.set(m.name, { map: m.name, count: n, source: m })
  }
  return [...best.values()].sort((a, b) => b.count - a.count)
}

/** False when the maps came from GraphQL or an old cache — no counts to show. */
export function hasLootData(maps: RawMap[]): boolean {
  return maps.some((m) => m.loot !== undefined)
}
