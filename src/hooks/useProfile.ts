import { useCallback, useState } from 'react'
import type { Profile } from '../types'

const KEY = 'tarkov.profile.v1'
export const MAX_LOYALTY = 4

// pmcLevel 0 = unset; features that gate by level (Best Quests) treat it as
// "level unknown, don't hide anything" until the user fills it in.
const EMPTY: Profile = { pmcLevel: 0, traders: {}, unlockedTraders: {} }

function read(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw) as Partial<Profile>
    return {
      pmcLevel: typeof p.pmcLevel === 'number' ? p.pmcLevel : 0,
      traders: p.traders && typeof p.traders === 'object' ? p.traders : {},
      unlockedTraders:
        p.unlockedTraders && typeof p.unlockedTraders === 'object' ? p.unlockedTraders : {},
    }
  } catch {
    return EMPTY
  }
}

function persist(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // storage unavailable — still works this session
  }
}

/** Trader loyalty level from the profile (defaults to LL1 — you always start there). */
export function traderLoyalty(profile: Profile, trader: string): number {
  return profile.traders[trader] ?? 1
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(read)

  const setPmcLevel = useCallback((level: number) => {
    setProfile((prev) => {
      const next = { ...prev, pmcLevel: Math.min(Math.max(level, 0), 79) }
      persist(next)
      return next
    })
  }, [])

  const setTraderLevel = useCallback((trader: string, level: number) => {
    setProfile((prev) => {
      const next = { ...prev, traders: { ...prev.traders, [trader]: level } }
      persist(next)
      return next
    })
  }, [])

  const setTraderUnlocked = useCallback((trader: string, unlocked: boolean) => {
    setProfile((prev) => {
      const next = { ...prev, unlockedTraders: { ...prev.unlockedTraders, [trader]: unlocked } }
      persist(next)
      return next
    })
  }, [])

  const replaceProfile = useCallback((p: Profile) => {
    const next: Profile = {
      pmcLevel: typeof p?.pmcLevel === 'number' ? p.pmcLevel : 0,
      traders: p?.traders && typeof p.traders === 'object' ? p.traders : {},
      unlockedTraders:
        p?.unlockedTraders && typeof p.unlockedTraders === 'object' ? p.unlockedTraders : {},
    }
    persist(next)
    setProfile(next)
  }, [])

  return { profile, setPmcLevel, setTraderLevel, setTraderUnlocked, replaceProfile }
}
