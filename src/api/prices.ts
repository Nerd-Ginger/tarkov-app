import type { PriceRow } from '../types'

const API_URL = 'https://api.tarkov.dev/graphql'
const CACHE_KEY = 'tarkov.prices.v1'
export const PRICES_MAX_AGE_MS = 60 * 60 * 1000 // 1h — flea prices move fast

export const ROUBLES_ID = '5449016a4bdc2d6f028b456f'

// Full PvE item catalog (~5k items, ~2 MB raw). Trimmed to ~500 KB before caching.
const PRICES_QUERY = `{
  items(gameMode: pve) {
    id
    name
    shortName
    avg24hPrice
    lastLowPrice
    changeLast48hPercent
    types
    sellFor { priceRUB source }
  }
}`

interface RawPriceItem {
  id: string
  name: string
  shortName: string
  avg24hPrice: number | null
  lastLowPrice: number | null
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
  return {
    id: raw.id,
    name: raw.name,
    shortName: raw.shortName,
    flea: raw.avg24hPrice && raw.avg24hPrice > 0 ? raw.avg24hPrice : null,
    lastLow: raw.lastLowPrice && raw.lastLowPrice > 0 ? raw.lastLowPrice : null,
    change48h: raw.changeLast48hPercent,
    trader,
    traderName,
    noFlea: (raw.types ?? []).includes('noFlea'),
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
