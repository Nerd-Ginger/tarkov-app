import { useCallback, useRef, useState } from 'react'
import { INTEL_MAX_AGE_MS, fetchIntel, readIntelCache } from '../api/intel'
import type { IntelCache } from '../api/intel'
import type { Intel } from '../types'

const EMPTY: Intel = { traderResets: [], goonReports: [], bossSpawns: [] }

/** Trader resets, goon reports, boss spawns — lazily fetched, cached ~10 min. */
export function useIntel() {
  const [cache, setCache] = useState<IntelCache | null>(() => readIntelCache())
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      setCache(await fetchIntel())
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  const ensureFresh = useCallback(() => {
    const current = readIntelCache()
    if (!current || Date.now() - current.fetchedAt > INTEL_MAX_AGE_MS) void refresh()
  }, [refresh])

  return {
    intel: cache?.intel ?? EMPTY,
    fetchedAt: cache?.fetchedAt ?? null,
    loading,
    offline,
    ensureFresh,
    refresh,
  }
}
