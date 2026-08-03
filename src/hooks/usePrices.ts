import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PRICES_MAX_AGE_MS, fetchPrices, readPricesCache, readPricesCacheFor } from '../api/prices'
import type { PricesCache } from '../api/prices'
import type { GameMode } from '../types'

/**
 * Live flea prices, lazily fetched: nothing hits the network until a view that
 * shows prices calls ensureFresh(). Cached ~1h; failures are silent (the UI
 * simply shows no prices) so offline use never breaks.
 *
 * PvE and PvP are separate economies with different prices. Only one mode is
 * cached at a time — the catalog is ~2.2MB against a ~5MB storage budget — so
 * switching modes refetches rather than keeping both.
 */
export function usePrices(mode: GameMode = 'pve') {
  const [cache, setCache] = useState<PricesCache | null>(() => readPricesCacheFor(mode))
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const inFlight = useRef(false)

  const refresh = useCallback(
    async (next: GameMode = mode) => {
      if (inFlight.current) return
      inFlight.current = true
      setLoading(true)
      try {
        const fresh = await fetchPrices(next)
        setCache(fresh)
        setOffline(false)
      } catch {
        setOffline(true)
      } finally {
        inFlight.current = false
        setLoading(false)
      }
    },
    [mode],
  )

  const ensureFresh = useCallback(() => {
    const current = readPricesCacheFor(mode)
    if (!current || Date.now() - current.fetchedAt > PRICES_MAX_AGE_MS) void refresh(mode)
  }, [refresh, mode])

  // mode is owned by useGameMode now — react to it rather than storing our own.
  // Prices are lazy (only price-showing views call ensureFresh), so this just
  // swaps in the cached set or clears; it deliberately does NOT fetch.
  useEffect(() => {
    setCache(readPricesCacheFor(mode))
  }, [mode])

  const rows = cache?.prices ?? []
  const byId = useMemo(() => new Map(rows.map((p) => [p.id, p])), [rows])

  return {
    rows,
    byId,
    fetchedAt: cache?.fetchedAt ?? null,
    source: cache?.source,
    loading,
    offline,
    ensureFresh,
    refresh,
  }
}

/** Re-exported so callers don't need the api module directly. */
export { readPricesCache }
