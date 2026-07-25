import type { DataSource, PriceRow } from '../types'
import { forceJson, pricesFromJson } from './jsonFallback'
import { GRAPHQL_TIMEOUT_MS, describe } from './shared'

const API_URL = 'https://api.tarkov.dev/graphql'
const CACHE_KEY = 'tarkov.prices.v5'
export const PRICES_MAX_AGE_MS = 60 * 60 * 1000 // 1h — flea prices move fast

export const ROUBLES_ID = '5449016a4bdc2d6f028b456f'

// Full PvE item catalog (~5k items, ~2 MB raw). Trimmed to ~500 KB before caching.
const PRICES_QUERY = `{
  items(gameMode: pve) {
    id
    name
    shortName
    width
    height
    avg24hPrice
    lastLowPrice
    low24hPrice
    high24hPrice
    changeLast48hPercent
    types
    sellFor { priceRUB source }
    buyFor {
      priceRUB
      source
      vendor { ... on TraderOffer { minTraderLevel } }
    }
  }
}`

export interface RawPriceItem {
  id: string
  name: string
  shortName: string
  width: number | null
  height: number | null
  avg24hPrice: number | null
  lastLowPrice: number | null
  low24hPrice: number | null
  high24hPrice: number | null
  changeLast48hPercent: number | null
  types: string[] | null
  sellFor: { priceRUB: number; source: string }[] | null
  buyFor: { priceRUB: number; source: string; vendor: { minTraderLevel?: number | null } | null }[] | null
}

export interface PricesCache {
  fetchedAt: number
  prices: PriceRow[]
  /** Which upstream served this data — absent on caches written before the fallback existed. */
  source?: DataSource
}

export function readPricesCache(): PricesCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PricesCache
    if (!Array.isArray(parsed.prices) || parsed.prices.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function writePricesCache(cache: PricesCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // storage full — prices still work this session from memory
  }
}

function trim(raw: RawPriceItem): PriceRow {
  const slots = Math.max(1, (raw.width ?? 1) * (raw.height ?? 1))
  // Roubles: the currency itself is trivially worth face value
  if (raw.id === ROUBLES_ID) {
    return {
      id: raw.id,
      name: raw.name,
      shortName: raw.shortName,
      flea: 1,
      lastLow: 1,
      change48h: 0,
      trader: 1,
      traderName: '',
      sellTo: [],
      noFlea: true,
      slots: 1,
      buyFrom: [],
    }
  }
  // `trader`/`traderName` stay the raw best-of-all for existing consumers
  // (ItemModal, KeysView, TradeModal). `sellTo` keeps every offer so the market
  // view can pick the best among traders the player has actually unlocked.
  let trader = 0
  let traderName = ''
  const sellTo: { source: string; price: number }[] = []
  for (const s of raw.sellFor ?? []) {
    if (s.source === 'fleaMarket' || s.priceRUB <= 0) continue
    sellTo.push({ source: cap(s.source), price: Math.round(s.priceRUB) })
    if (s.priceRUB > trader) {
      trader = s.priceRUB
      traderName = s.source
    }
  }
  sellTo.sort((a, b) => b.price - a.price)
  // Only trust a flea price backed by a real 24h trading spread. tarkov.dev
  // keeps a flat placeholder price (avg = low = high, often absurd) for
  // restricted/untradeable items — event masks, quest-fuel, gun parts — that
  // aren't actually sellable on flea. A genuine market has low < high; anything
  // without that spread (or with no 24h low/high at all) we don't trust.
  const traded =
    raw.low24hPrice != null && raw.high24hPrice != null && raw.high24hPrice > raw.low24hPrice
  // Where to buy it: trader offers always count; the flea buy option only when
  // the item genuinely trades (same guard as the sell price).
  const buyFrom = (raw.buyFor ?? [])
    .filter((b) => b.priceRUB > 0 && (b.source !== 'fleaMarket' || traded))
    .map((b) => ({
      source: b.source === 'fleaMarket' ? 'Flea' : cap(b.source),
      price: b.priceRUB,
      minLevel: b.vendor?.minTraderLevel ?? 0,
    }))
    .sort((a, b) => a.price - b.price)
  return {
    id: raw.id,
    name: raw.name,
    shortName: raw.shortName,
    flea: traded && raw.avg24hPrice && raw.avg24hPrice > 0 ? raw.avg24hPrice : null,
    lastLow: traded && raw.lastLowPrice && raw.lastLowPrice > 0 ? raw.lastLowPrice : null,
    change48h: raw.changeLast48hPercent,
    trader,
    traderName,
    sellTo,
    noFlea: (raw.types ?? []).includes('noFlea'),
    slots,
    buyFrom,
  }
}

/** "therapist" → "Therapist" */
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

async function fetchPricesGraphql(): Promise<RawPriceItem[]> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: PRICES_QUERY }),
    // without a deadline a hung VPS never fails, so the fallback never runs
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`tarkov.dev API returned ${res.status}`)
  const json = await res.json()
  const items: RawPriceItem[] = (json?.data?.items ?? []).filter(Boolean)
  if (items.length === 0) throw new Error('tarkov.dev API returned no items')
  return items
}

export async function fetchPrices(): Promise<PricesCache> {
  let gqlError: unknown
  if (!forceJson()) {
    try {
      const cache = { fetchedAt: Date.now(), prices: (await fetchPricesGraphql()).map(trim), source: 'graphql' as const }
      writePricesCache(cache)
      return cache
    } catch (e) {
      gqlError = e
    }
  }
  try {
    const cache = { fetchedAt: Date.now(), prices: (await pricesFromJson()).map(trim), source: 'json' as const }
    writePricesCache(cache)
    return cache
  } catch (jsonError) {
    throw new Error(`prices unavailable — graphql: ${describe(gqlError)}; json: ${describe(jsonError)}`)
  }
}
