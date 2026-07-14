import type { Inventory } from '../hooks/useInventory'
import type { QuestProgress } from '../hooks/useQuestProgress'

export interface ProgressData {
  done: string[]
  inventory: Inventory
  hideout: string[]
  questProgress: QuestProgress
  active: string[]
}

/** Download the full progress state as tarkov-progress.json (version 4). */
export function exportProgress(
  done: Set<string>,
  inventory: Inventory,
  hideout: Set<string>,
  questProgress: QuestProgress,
  active: Set<string>,
) {
  const data = JSON.stringify(
    { version: 4, done: [...done], inventory, hideout: [...hideout], questProgress, active: [...active] },
    null,
    2,
  )
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tarkov-progress.json'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Pick a progress file and parse it. Accepts v2 files, v1 files ({ done }) and
 * the original bare-array format — older saves only carry quest done-state.
 */
export function importProgress(onLoad: (data: ProgressData) => void) {
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
        const doneRaw: unknown[] = Array.isArray(parsed) ? parsed : parsed.done ?? []
        const done = doneRaw.filter((id): id is string => typeof id === 'string')
        const inventory =
          parsed && typeof parsed.inventory === 'object' && parsed.inventory !== null
            ? (parsed.inventory as Inventory)
            : {}
        const hideoutRaw: unknown[] = Array.isArray(parsed?.hideout) ? parsed.hideout : []
        const hideout = hideoutRaw.filter((k): k is string => typeof k === 'string')
        const questProgress: QuestProgress =
          parsed && typeof parsed.questProgress === 'object' && parsed.questProgress !== null
            ? (parsed.questProgress as QuestProgress)
            : {}
        const activeRaw: unknown[] = Array.isArray(parsed?.active) ? parsed.active : []
        const active = activeRaw.filter((id): id is string => typeof id === 'string')
        onLoad({ done, inventory, hideout, questProgress, active })
      } catch {
        alert('Could not read that file — expected a tarkov-progress.json save.')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}
