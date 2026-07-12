import { useCallback, useState } from 'react'

const HIDEOUT_KEY = 'tarkov.hideout.v1'

function readBuilt(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDEOUT_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function persist(built: Set<string>) {
  try {
    localStorage.setItem(HIDEOUT_KEY, JSON.stringify([...built]))
  } catch {
    // storage unavailable — state still works this session
  }
}

/** Built hideout station levels, keyed `${stationId}:${level}`. */
export function useHideout() {
  const [built, setBuilt] = useState<Set<string>>(readBuilt)

  const toggleBuilt = useCallback((key: string) => {
    setBuilt((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      persist(next)
      return next
    })
  }, [])

  const replaceBuilt = useCallback((keys: string[]) => {
    const next = new Set(keys.filter((k) => typeof k === 'string'))
    persist(next)
    setBuilt(next)
  }, [])

  return { built, toggleBuilt, replaceBuilt }
}
