/** Synthetic group name for the pinned favorites row group. */
export const FAVORITES_GROUP = '★ Favorites'

/**
 * Prepend a ★ Favorites group to a grouped table.
 *
 * Rows are gathered from the groups themselves rather than the source list, so
 * the favorites group automatically respects whatever search/filters the view
 * already applied. Starred rows stay in their normal group too — this is a
 * shortcut to them, not a move.
 */
export function withFavoritesGroup<T>(
  groups: [string, T[]][],
  id: (row: T) => string,
  favorites: Set<string>,
  pinned: boolean,
): [string, T[]][] {
  if (!pinned || favorites.size === 0) return groups
  const seen = new Set<string>()
  const starred: T[] = []
  for (const [, rows] of groups) {
    for (const row of rows) {
      const key = id(row)
      if (favorites.has(key) && !seen.has(key)) {
        seen.add(key)
        starred.push(row)
      }
    }
  }
  return starred.length > 0 ? [[FAVORITES_GROUP, starred], ...groups] : groups
}

/**
 * Comparator fragment for flat tables: favorites first, everything else
 * unchanged. Returns 0 when pinning is off so it composes as a no-op.
 */
export function favoritesFirst<T>(
  id: (row: T) => string,
  favorites: Set<string>,
  pinned: boolean,
): (a: T, b: T) => number {
  if (!pinned || favorites.size === 0) return () => 0
  return (a, b) => Number(favorites.has(id(b))) - Number(favorites.has(id(a)))
}

/**
 * Open-state for a group row, with the favorites group defaulting to open.
 *
 * The expanded set means "collapsed" for the favorites group specifically —
 * inverted because the set starts empty (everything collapsed) but a group you
 * just opted into should be visible without another click. Still toggleable.
 */
export function groupIsOpen(group: string, expanded: Set<string>, search: string): boolean {
  if (group === FAVORITES_GROUP) return !expanded.has(FAVORITES_GROUP)
  return search !== '' || expanded.has(group)
}
