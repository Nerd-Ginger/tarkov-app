import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CACHE_MAX_AGE_MS, SNAPSHOT, fetchTasks, readCacheFor } from '../api/tarkovDev'
import type { GameMode } from '../types'
import type { TaskCache } from '../api/tarkovDev'
import {
  normalizeAmmo,
  normalizeBarters,
  normalizeCrafts,
  normalizeKeys,
  normalizeStations,
  normalizeTasks,
} from '../data/normalize'
import { normalizeStims } from '../data/stims'

export type LoadStatus = 'loading' | 'ready' | 'error'

/** The bundled snapshot is PvE — it must never stand in for PvP. */
function seedFor(mode: GameMode): TaskCache | null {
  return readCacheFor(mode) ?? (mode === 'pve' ? SNAPSHOT : null)
}

export function useQuestData(mode: GameMode = 'pve') {
  // Always start with data: a saved cache if present, otherwise the bundled snapshot.
  const [cache, setCache] = useState<TaskCache | null>(() => seedFor(mode))
  const [status, setStatus] = useState<LoadStatus>(cache ? 'ready' : 'loading')
  const [offline, setOffline] = useState(false)
  const inFlight = useRef(false)

  const refresh = useCallback(
    async (next: GameMode = mode) => {
      if (inFlight.current) return
      inFlight.current = true
      setStatus((s) => (s === 'ready' ? 'ready' : 'loading'))
      try {
        const fresh = await fetchTasks(next)
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
    },
    [mode],
  )

  useEffect(() => {
    const current = readCacheFor(mode)
    if (!current) {
      // switching modes: drop the other mode's quests immediately rather than
      // showing them while the new set loads
      const seed = seedFor(mode)
      setCache(seed)
      setStatus(seed ? 'ready' : 'loading')
      void refresh(mode)
      return
    }
    setCache(current)
    // One TTL for both sources now that JSON is primary. It used to re-check
    // json-sourced data every 2h, on the theory that JSON was a stand-in for a
    // downed GraphQL and we wanted to pick GraphQL back up quickly. With JSON
    // as the normal path that would just mean hitting their API 6x more often
    // for no new data.
    if (Date.now() - current.fetchedAt > CACHE_MAX_AGE_MS) void refresh(mode)
  }, [mode, refresh])

  const quests = useMemo(() => (cache ? normalizeTasks(cache.tasks) : []), [cache])
  const stations = useMemo(() => (cache ? normalizeStations(cache.stations ?? []) : []), [cache])
  const ammo = useMemo(() => (cache ? normalizeAmmo(cache.ammo ?? []) : []), [cache])
  const barters = useMemo(() => (cache ? normalizeBarters(cache.barters ?? []) : []), [cache])
  const crafts = useMemo(() => (cache ? normalizeCrafts(cache.crafts ?? []) : []), [cache])
  const keys = useMemo(() => (cache ? normalizeKeys(cache.maps ?? []) : []), [cache])
  const stims = useMemo(() => (cache ? normalizeStims(cache.stims ?? []) : []), [cache])

  return {
    quests,
    stations,
    ammo,
    barters,
    crafts,
    keys,
    // raw maps too: the map view needs ids/slugs that normalizeKeys drops
    rawMaps: cache?.maps ?? [],
    stims,
    status,
    offline,
    fetchedAt: cache?.fetchedAt ?? null,
    source: cache?.source,
    refresh,
  }
}
