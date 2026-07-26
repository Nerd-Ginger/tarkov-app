interface Props {
  id: string
  favorites: Set<string>
  onToggle: (id: string) => void
}

/**
 * Star toggle for a list row. Lives inside the row's name cell rather than its
 * own column, so grouped tables don't need their colSpan counts changed.
 *
 * Stops propagation because several list rows are themselves clickable (crafts
 * and barters open a trade modal, stims expand).
 */
export function FavoriteStar({ id, favorites, onToggle }: Props) {
  const on = favorites.has(id)
  return (
    <button
      className={`fav-star ${on ? 'on' : ''}`}
      title={on ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={on ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(id)
      }}
    >
      {on ? '★' : '☆'}
    </button>
  )
}

/** The shared "pin favorites to the top" toggle for a view's filter bar. */
export function FavoritesToggle({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <label
      className={`check-label fav-toggle ${pinned ? 'on' : ''}`}
      title="Pin starred rows to the top — a ★ Favorites group on grouped tables"
    >
      <input type="checkbox" checked={pinned} onChange={onToggle} />★ Favorites
    </label>
  )
}
