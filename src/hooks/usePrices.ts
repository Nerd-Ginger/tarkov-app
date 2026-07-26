import { useCallback, useMemo, useRef, useState } from 'react'
import { PRICES_MAX_AGE_MS, fetchPrices, readPricesCache, readPricesCacheFor } from '../api/prices'
import type { PricesCache } from '../api/prices'
import type { PriceMode } from '../types'

const MODE_KEY = 'tarkov.priceMode.v1'

function readMode(): PriceMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'regular' ? 'regular' : 'pve'
  } catch {
    return 'pve'
  }
}

/**
 * Live flea prices, lazily fetched: nothing hits the network until a view that
 * shows prices calls ensureFresh(). Cached ~1h; failures are silent (the UI
 * simply shows no prices) so offline use never breaks.
 *
 * PvE and PvP are separate economies with different prices. Only one mode is
 * cached at a time — the catalog is ~2.2MB against a ~5MB storage budget — so
 * switching modes refetches rather than keeping both.
 */
export function usePrices() {
  const [mode, setModeState] = useState<PriceMode>(readMode)
  const [cache, setCache] = useState<PricesCache | null>(() => readPricesCacheFor(readMode()))
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const inFlight = useRef(false)

  const refresh = useCallback(async (next: PriceMode = mode) => {
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
  }, [mode])

  const ensureFresh = useCallback(() => {
    const current = readPricesCacheFor(mode)
    if (!current || Date.now() - current.fetchedAt > PRICES_MAX_AGE_MS) void refresh(mode)
  }, [refresh, mode])

  /** Switch economies. Serves the cached set if it happens to be that mode, else refetches. */
  const setMode = useCallback(
    (next: PriceMode) => {
      if (next === mode) return
      setModeState(next)
      try {
        localStorage.setItem(MODE_KEY, next)
      } catch {
        // fine — mode just won't persist
      }
      const cached = readPricesCacheFor(next)
      if (cached && Date.now() - cached.fetchedAt <= PRICES_MAX_AGE_MS) setCache(cached)
      else {
        // clear immediately so no view shows the other mode's numbers while loading
        setCache(null)
        void refresh(next)
      }
    },
    [mode, refresh],
  )

  const rows = cache?.prices ?? []
  const byId = useMemo(() => new Map(rows.map((p) => [p.id, p])), [rows])

  return {
    rows,
    byId,
    fetchedAt: cache?.fetchedAt ?? null,
    source: cache?.source,
    mode,
    setMode,
    loading,
    offline,
    ensureFresh,
    refresh,
  }
}

/** Re-exported so callers don't need the api module directly. */
export { readPricesCache }
