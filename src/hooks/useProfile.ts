import { useCallback, useState } from 'react'
import type { Profile } from '../types'

const KEY = 'tarkov.profile.v1'
export const MAX_LOYALTY = 4

const EMPTY: Profile = { pmcLevel: 1, traders: {} }

function read(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw) as Partial<Profile>
    return {
      pmcLevel: typeof p.pmcLevel === 'number' ? p.pmcLevel : 1,
      traders: p.traders && typeof p.traders === 'object' ? p.traders : {},
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

  const replaceProfile = useCallback((p: Profile) => {
    const next: Profile = {
      pmcLevel: typeof p?.pmcLevel === 'number' ? p.pmcLevel : 1,
      traders: p?.traders && typeof p.traders === 'object' ? p.traders : {},
    }
    persist(next)
    setProfile(next)
  }, [])

  return { profile, setPmcLevel, setTraderLevel, replaceProfile }
}
