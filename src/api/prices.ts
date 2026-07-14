import type { PriceRow } from '../types'

const API_URL = 'https://api.tarkov.dev/graphql'
const CACHE_KEY = 'tarkov.prices.v2'
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
    changeLast48hPercent
    types
    sellFor { priceRUB source }
  }
}`

interface RawPriceItem {
  id: string
  name: string
  shortName: string
  width: number | null
  height: number | null
  avg24hPrice: number | null
  lastLowPrice: number | null
  low24hPrice: number | null
  changeLast48hPercent: number | null
  types: string[] | null
  sellFor: { priceRUB: number; source: string }[] | null
}

export interface PricesCache {
  fetchedAt: number
  prices: PriceRow[]
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
      noFlea: true,
      slots: 1,
    }
  }
  let trader = 0
  let traderName = ''
  for (const s of raw.sellFor ?? []) {
    if (s.source === 'fleaMarket') continue
    if (s.priceRUB > trader) {
      trader = s.priceRUB
      traderName = s.source
    }
  }
  // Only trust a flea price backed by real 24h trades. tarkov.dev keeps a flat
  // estimated avg for restricted/untradeable items (event masks etc.) with no
  // 24h low — those aren't actually sellable on flea, so we drop the price.
  const traded = raw.low24hPrice != null
  return {
    id: raw.id,
    name: raw.name,
    shortName: raw.shortName,
    flea: traded && raw.avg24hPrice && raw.avg24hPrice > 0 ? raw.avg24hPrice : null,
    lastLow: traded && raw.lastLowPrice && raw.lastLowPrice > 0 ? raw.lastLowPrice : null,
    change48h: raw.changeLast48hPercent,
    trader,
    traderName,
    noFlea: (raw.types ?? []).includes('noFlea'),
    slots,
  }
}

export async function fetchPrices(): Promise<PricesCache> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: PRICES_QUERY }),
  })
  if (!res.ok) throw new Error(`tarkov.dev API returned ${res.status}`)
  const json = await res.json()
  const items: RawPriceItem[] = (json?.data?.items ?? []).filter(Boolean)
  if (items.length === 0) throw new Error('tarkov.dev API returned no items')
  const cache = { fetchedAt: Date.now(), prices: items.map(trim) }
  writePricesCache(cache)
  return cache
}
