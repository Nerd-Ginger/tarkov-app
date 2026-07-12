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

  const exportDone = useCallback(() => {
    const data = JSON.stringify({ version: 1, done: [...done] }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tarkov-progress.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [done])

  const importDone = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string)
          const ids: string[] = Array.isArray(parsed) ? parsed : parsed.done ?? []
          const next = new Set(ids.filter((id): id is string => typeof id === 'string'))
          persist(next)
          setDone(next)
        } catch {
          alert('Could not read that file — expected a tarkov-progress.json save.')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [])

  return { done, toggle, exportDone, importDone }
}
