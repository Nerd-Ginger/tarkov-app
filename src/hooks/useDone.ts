import { useCallback, useState } from 'react'

const DONE_KEY = 'tarkov.done.v1'

function readDone(): Set<string> {
  try {
    const raw = localStorage.getItem(DONE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function persist(ids: Set<string>) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...ids]))
  } catch {
    // storage unavailable — state still works this session
  }
}

export function useDone() {
  const [done, setDone] = useState<Set<string>>(readDone)

  const toggle = useCallback((id: string) => {
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persist(next)
      return next
    })
  }, [])

  const replaceDone = useCallback((ids: string[]) => {
    const next = new Set(ids.filter((id) => typeof id === 'string'))
    persist(next)
    setDone(next)
  }, [])

  return { done, toggle, replaceDone }
}
