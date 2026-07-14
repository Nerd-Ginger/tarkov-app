import { useCallback, useState } from 'react'

const KEY = 'tarkov.active.v1'

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

/** Quests the user is currently running in game ("Active"). */
export function useActive() {
  const [active, setActive] = useState<Set<string>>(read)

  const toggleActive = useCallback((id: string) => {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persist(next)
      return next
    })
  }, [])

  const clearActive = useCallback((id: string) => {
    setActive((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      persist(next)
      return next
    })
  }, [])

  const replaceActive = useCallback((ids: string[]) => {
    const next = new Set(ids)
    persist(next)
    setActive(next)
  }, [])

  return { active, toggleActive, clearActive, replaceActive }
}
