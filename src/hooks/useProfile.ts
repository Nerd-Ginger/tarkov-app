import { useCallback, useState } from 'react'
import type { Profile, QuestFaction } from '../types'

const KEY = 'tarkov.profile.v1'
export const MAX_LOYALTY = 4

// pmcLevel 0 = unset; features that gate by level (Best Quests) treat it as
// "level unknown, don't hide anything" until the user fills it in.
const EMPTY: Profile = {
  pmcLevel: 0,
  traders: {},
  unlockedTraders: {},
  faction: 'Any',
  reputation: {},
}

/** The only two traders any quest gates on standing. */
export const REP_TRADERS = ['Fence', 'Lightkeeper']

function asFaction(v: unknown): QuestFaction {
  return v === 'BEAR' || v === 'USEC' ? v : 'Any'
}

/** Keeps only numeric entries, so a hand-edited save can't poison comparisons. */
function asRep(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {}
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter(([, n]) => typeof n === 'number' && Number.isFinite(n)),
  ) as Record<string, number>
}

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
      faction: asFaction(p?.faction),
      reputation: asRep(p?.reputation),
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

  const setFaction = useCallback((faction: QuestFaction) => {
    setProfile((prev) => {
      const next = { ...prev, faction }
      persist(next)
      return next
    })
  }, [])

  /** null clears the key — "unset" has to stay distinguishable from a standing of 0. */
  const setReputation = useCallback((trader: string, value: number | null) => {
    setProfile((prev) => {
      const reputation = { ...prev.reputation }
      if (value === null) delete reputation[trader]
      else reputation[trader] = value
      const next = { ...prev, reputation }
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
      faction: asFaction(p?.faction),
      reputation: asRep(p?.reputation),
    }
    persist(next)
    setProfile(next)
  }, [])

  return {
    profile,
    setPmcLevel,
    setTraderLevel,
    setTraderUnlocked,
    setFaction,
    setReputation,
    replaceProfile,
  }
}
