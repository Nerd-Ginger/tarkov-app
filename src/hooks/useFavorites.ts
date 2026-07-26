import { useCallback, useState } from 'react'

const FAV_KEY = 'tarkov.favorites.v1'
const PIN_KEY = 'tarkov.favoritesPinned.v1'

/**
 * Starred rows across every list view — ammo, stims, crafts, barters, keys,
 * items, fire sale. Ids are globally unique (item ids, craft ids, barter ids),
 * so one flat set covers all of them without namespacing per view.
 *
 * `pinned` is the shared toggle: when on, favorites sort to the top of flat
 * tables and collect into a ★ Favorites group at the top of grouped ones.
 */
function readFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function readPinned(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === '1'
  } catch {
    return false
  }
}

function persist(ids: Set<string>) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...ids]))
  } catch {
    // storage unavailable — state still works this session
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(readFavorites)
  const [pinned, setPinned] = useState<boolean>(readPinned)

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persist(next)
      return next
    })
  }, [])

  const togglePinned = useCallback(() => {
    setPinned((prev) => {
      const next = !prev
      try {
        localStorage.setItem(PIN_KEY, next ? '1' : '0')
      } catch {
        // fine — just won't persist
      }
      return next
    })
  }, [])

  const replaceFavorites = useCallback((ids: string[]) => {
    const next = new Set(ids.filter((id) => typeof id === 'string'))
    persist(next)
    setFavorites(next)
  }, [])

  return { favorites, pinned, toggleFavorite, togglePinned, replaceFavorites }
}

/** Shape every list view needs — pass straight through as one prop. */
export interface FavoriteProps {
  favorites: Set<string>
  pinned: boolean
  onToggleFavorite: (id: string) => void
  onTogglePinned: () => void
}
