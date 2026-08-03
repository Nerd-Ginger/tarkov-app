import { useCallback, useState } from 'react'

const KEY = 'tarkov.failed.v1'

/**
 * Quests the player failed.
 *
 * Worth tracking mainly for the 19 requirements shaped `['complete','failed']` —
 * "finish this OR fail it". Without a failed set, a user who genuinely failed
 * the prerequisite is stuck behind it unless they lie and tick "done".
 */
function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function persist(ids: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]))
  } catch {
    // storage unavailable — state still works this session
  }
}

export function useFailed() {
  const [failed, setFailed] = useState<Set<string>>(read)

  const toggleFailed = useCallback((id: string) => {
    setFailed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persist(next)
      return next
    })
  }, [])

  const clearFailed = useCallback((id: string) => {
    setFailed((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      persist(next)
      return next
    })
  }, [])

  const replaceFailed = useCallback((ids: string[]) => {
    const next = new Set(ids.filter((id) => typeof id === 'string'))
    persist(next)
    setFailed(next)
  }, [])

  return { failed, toggleFailed, clearFailed, replaceFailed }
}
