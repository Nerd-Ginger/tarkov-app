import { useCallback, useMemo, useRef, useState } from 'react'
import { PRICES_MAX_AGE_MS, fetchPrices, readPricesCache } from '../api/prices'
import type { PricesCache } from '../api/prices'

/**
 * Live flea prices, lazily fetched: nothing hits the network until a view that
 * shows prices calls ensureFresh(). Cached ~1h; failures are silent (the UI
 * simply shows no prices) so offline use never breaks.
 */
export function usePrices() {
  const [cache, setCache] = useState<PricesCache | null>(() => readPricesCache())
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      const fresh = await fetchPrices()
      setCache(fresh)
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  const ensureFresh = useCallback(() => {
    const current = readPricesCache()
    if (!current || Date.now() - current.fetchedAt > PRICES_MAX_AGE_MS) void refresh()
  }, [refresh])

  const rows = cache?.prices ?? []
  const byId = useMemo(() => new Map(rows.map((p) => [p.id, p])), [rows])

  return { rows, byId, fetchedAt: cache?.fetchedAt ?? null, loading, offline, ensureFresh, refresh }
}
