import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CACHE_MAX_AGE_MS, SNAPSHOT, fetchTasks, readCache } from '../api/tarkovDev'
import type { TaskCache } from '../api/tarkovDev'
import {
  normalizeAmmo,
  normalizeBarters,
  normalizeCrafts,
  normalizeKeys,
  normalizeStations,
  normalizeTasks,
} from '../data/normalize'

export type LoadStatus = 'loading' | 'ready' | 'error'

export function useQuestData() {
  // Always start with data: a saved cache if present, otherwise the bundled snapshot.
  const [cache, setCache] = useState<TaskCache | null>(() => readCache() ?? SNAPSHOT)
  const [status, setStatus] = useState<LoadStatus>(cache ? 'ready' : 'loading')
  const [offline, setOffline] = useState(false)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setStatus((s) => (s === 'ready' ? 'ready' : 'loading'))
    try {
      const fresh = await fetchTasks()
      setCache(fresh)
      setStatus('ready')
      setOffline(false)
    } catch {
      // keep whatever we have; only a hard error if there's no cache at all
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'))
      setOffline(true)
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    const current = readCache()
    if (!current || Date.now() - current.fetchedAt > CACHE_MAX_AGE_MS) void refresh()
  }, [refresh])

  const quests = useMemo(() => (cache ? normalizeTasks(cache.tasks) : []), [cache])
  const stations = useMemo(() => (cache ? normalizeStations(cache.stations ?? []) : []), [cache])
  const ammo = useMemo(() => (cache ? normalizeAmmo(cache.ammo ?? []) : []), [cache])
  const barters = useMemo(() => (cache ? normalizeBarters(cache.barters ?? []) : []), [cache])
  const crafts = useMemo(() => (cache ? normalizeCrafts(cache.crafts ?? []) : []), [cache])
  const keys = useMemo(() => (cache ? normalizeKeys(cache.maps ?? []) : []), [cache])

  return {
    quests,
    stations,
    ammo,
    barters,
    crafts,
    keys,
    status,
    offline,
    fetchedAt: cache?.fetchedAt ?? null,
    refresh,
  }
}
