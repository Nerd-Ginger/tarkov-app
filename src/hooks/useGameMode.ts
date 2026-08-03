import { useCallback, useState } from 'react'
import type { GameMode } from '../types'

const KEY = 'tarkov.gameMode.v1'
/** The price-only toggle this replaced — read once so the choice already made carries over. */
const LEGACY_PRICE_KEY = 'tarkov.priceMode.v1'

function read(): GameMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'regular' || v === 'pve') return v
    return localStorage.getItem(LEGACY_PRICE_KEY) === 'regular' ? 'regular' : 'pve'
  } catch {
    return 'pve'
  }
}

/**
 * Which game mode the app tracks, app-wide.
 *
 * Deliberately one setting rather than separate quest and price modes: the two
 * disagreeing is a state nobody can reason about, and it wouldn't be visible in
 * the UI. Quest data, prices, hideout, barters and crafts all follow this.
 */
export function useGameMode() {
  const [mode, setModeState] = useState<GameMode>(read)

  const setMode = useCallback((next: GameMode) => {
    setModeState((prev) => {
      if (prev === next) return prev
      try {
        localStorage.setItem(KEY, next)
      } catch {
        // fine — mode just won't persist
      }
      return next
    })
  }, [])

  return { mode, setMode }
}
