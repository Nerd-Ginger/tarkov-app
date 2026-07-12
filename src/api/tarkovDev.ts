import type { RawTask } from '../types'
import snapshot from '../data/snapshot.json'

const API_URL = 'https://api.tarkov.dev/graphql'
const CACHE_KEY = 'tarkov.tasks.v3'
export const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12h

/**
 * Quest data bundled at build time so the app works instantly — even offline, and
 * even when opened as a standalone file:// page before any live fetch. Live data
 * refreshes over the top when the network is available.
 */
export const SNAPSHOT = snapshot as TaskCache

// gameMode: pve — we play the PvE version; its quest list differs from regular (PvP).
const QUERY = `{
  tasks(lang: en, gameMode: pve) {
    id
    name
    minPlayerLevel
    kappaRequired
    wikiLink
    trader { name }
    map { name }
    objectives {
      type
      description
      optional
      maps { name }
      ... on TaskObjectiveItem { foundInRaid }
    }
  }
}`

export interface TaskCache {
  fetchedAt: number
  tasks: RawTask[]
}

export function readCache(): TaskCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TaskCache
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(cache: TaskCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // storage full or unavailable — live data still works this session
  }
}

export async function fetchTasks(): Promise<TaskCache> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY }),
  })
  if (!res.ok) throw new Error(`tarkov.dev API returned ${res.status}`)
  const json = await res.json()
  const tasks: RawTask[] | undefined = json?.data?.tasks
  if (!tasks || tasks.length === 0) throw new Error('tarkov.dev API returned no tasks')
  const cache = { fetchedAt: Date.now(), tasks }
  writeCache(cache)
  return cache
}
