import { useCallback, useState } from 'react'

const KEY = 'tarkov.progress.v1'

/** Tracked counts keyed by objective id (e.g. "kill 8 of 10" → 8). */
export type QuestProgress = Record<string, number>

function read(): QuestProgress {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as QuestProgress) : {}
  } catch {
    return {}
  }
}

function persist(p: QuestProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // storage unavailable — still works this session
  }
}

export function useQuestProgress() {
  const [progress, setProgress] = useState<QuestProgress>(read)

  const setObjective = useCallback((objectiveId: string, value: number) => {
    setProgress((prev) => {
      const next = { ...prev }
      if (value <= 0) delete next[objectiveId]
      else next[objectiveId] = value
      persist(next)
      return next
    })
  }, [])

  const replaceProgress = useCallback((p: QuestProgress) => {
    setProgress(p)
    persist(p)
  }, [])

  return { progress, setObjective, replaceProgress }
}
