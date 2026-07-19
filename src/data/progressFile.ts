import type { Inventory } from '../hooks/useInventory'
import type { QuestProgress } from '../hooks/useQuestProgress'
import type { Profile } from '../types'

const DEFAULT_PROFILE: Profile = { pmcLevel: 0, traders: {}, unlockedTraders: {} }

export interface ProgressData {
  done: string[]
  inventory: Inventory
  hideout: string[]
  questProgress: QuestProgress
  active: string[]
  profile: Profile
}

/** Download the full progress state as tarkov-progress.json (version 5). */
export function exportProgress(
  done: Set<string>,
  inventory: Inventory,
  hideout: Set<string>,
  questProgress: QuestProgress,
  active: Set<string>,
  profile: Profile,
) {
  const data = JSON.stringify(
    {
      version: 5,
      done: [...done],
      inventory,
      hideout: [...hideout],
      questProgress,
      active: [...active],
      profile,
    },
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
        const profile: Profile =
          parsed && typeof parsed.profile === 'object' && parsed.profile !== null
            ? {
                pmcLevel: typeof parsed.profile.pmcLevel === 'number' ? parsed.profile.pmcLevel : 0,
                traders:
                  typeof parsed.profile.traders === 'object' && parsed.profile.traders !== null
                    ? parsed.profile.traders
                    : {},
                // absent in files saved before trader gating — an older save just
                // means "nothing manually unlocked", which is the safe default
                unlockedTraders:
                  typeof parsed.profile.unlockedTraders === 'object' &&
                  parsed.profile.unlockedTraders !== null
                    ? parsed.profile.unlockedTraders
                    : {},
              }
            : DEFAULT_PROFILE
        onLoad({ done, inventory, hideout, questProgress, active, profile })
      } catch {
        alert('Could not read that file — expected a tarkov-progress.json save.')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}
