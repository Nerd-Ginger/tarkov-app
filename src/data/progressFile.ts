import type { Inventory } from '../hooks/useInventory'
import type { QuestProgress } from '../hooks/useQuestProgress'
import type { GameMode, Profile, QuestFaction } from '../types'

const DEFAULT_PROFILE: Profile = {
  pmcLevel: 0,
  traders: {},
  unlockedTraders: {},
  faction: 'Any',
  reputation: {},
}

/** Bump when the shape gains fields. Only used to warn about newer files. */
export const SAVE_VERSION = 7

export interface ProgressData {
  done: string[]
  inventory: Inventory
  hideout: string[]
  questProgress: QuestProgress
  active: string[]
  failed: string[]
  profile: Profile
  favorites: string[]
  gameMode: GameMode
}

/** Download the full progress state as tarkov-progress.json (version 7). */
export function exportProgress(
  done: Set<string>,
  inventory: Inventory,
  hideout: Set<string>,
  questProgress: QuestProgress,
  active: Set<string>,
  failed: Set<string>,
  profile: Profile,
  favorites: Set<string>,
  gameMode: GameMode,
) {
  const data = JSON.stringify(
    {
      version: SAVE_VERSION,
      done: [...done],
      inventory,
      hideout: [...hideout],
      questProgress,
      active: [...active],
      failed: [...failed],
      profile,
      favorites: [...favorites],
      gameMode,
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
 * Pick a progress file and parse it.
 *
 * Every field is guarded independently rather than dispatched on `version`, so
 * any older save — v6, v2, v1's bare `{ done }`, even the original bare array —
 * loads with the missing fields defaulted. The defaults are chosen so an old
 * file never *loses* anything and never gates anything it didn't gate before:
 * no failed quests, faction 'Any' (hides nothing), and no standing set (every
 * trader requirement reads *unknown* rather than unmet).
 *
 * `version` is read only to warn when a file comes from a newer build than this
 * one, where silent field-dropping would be the confusing outcome.
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
        const version = typeof parsed?.version === 'number' ? parsed.version : 0
        if (version > SAVE_VERSION) {
          const ok = window.confirm(
            `This save is from a newer version of the tracker (file v${version}, this build reads v${SAVE_VERSION}).\n\n` +
              `Anything it stores that this build doesn't know about will be dropped when you next save.\n\n` +
              `Load it anyway?`,
          )
          if (!ok) return
        }
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
        // absent before failed quests were tracked — nothing failed is the safe default
        const failedRaw: unknown[] = Array.isArray(parsed?.failed) ? parsed.failed : []
        const failed = failedRaw.filter((id): id is string => typeof id === 'string')
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
                // 'Any' hides nothing, so an old save's quest list is unchanged
                faction:
                  parsed.profile.faction === 'BEAR' || parsed.profile.faction === 'USEC'
                    ? (parsed.profile.faction as QuestFaction)
                    : 'Any',
                // key absence = unset; 0 is a real standing three quests gate on
                reputation:
                  typeof parsed.profile.reputation === 'object' && parsed.profile.reputation !== null
                    ? (Object.fromEntries(
                        Object.entries(parsed.profile.reputation as Record<string, unknown>).filter(
                          ([, n]) => typeof n === 'number' && Number.isFinite(n),
                        ),
                      ) as Record<string, number>)
                    : {},
              }
            : DEFAULT_PROFILE
        // absent in files saved before favorites existed — empty is the safe default
        const favRaw: unknown[] = Array.isArray(parsed?.favorites) ? parsed.favorites : []
        const favorites = favRaw.filter((id): id is string => typeof id === 'string')
        // every pre-v7 save predates PvP support, so it can only be a PvE save
        const gameMode: GameMode = parsed?.gameMode === 'regular' ? 'regular' : 'pve'
        onLoad({ done, inventory, hideout, questProgress, active, failed, profile, favorites, gameMode })
      } catch {
        alert('Could not read that file — expected a tarkov-progress.json save.')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}
