import { useMemo, useState } from 'react'
import type { MedKind, Stim, StimEffect, StimPairing, StimRole } from '../types'
import { ROLE_ORDER, buildStimPairings, isInstantType, isPercentType } from '../data/stims'
import { useExpandedGroups } from '../hooks/useExpandedGroups'
import type { FavoriteProps } from '../hooks/useFavorites'
import { favoritesFirst } from '../data/favorites'
import { FavoriteStar, FavoritesToggle } from './FavoriteStar'

type SortField = 'name' | 'role' | 'buffs' | 'debuffs' | 'duration' | 'useTime' | 'conflicts'
type SortDir = 'asc' | 'desc'

interface Props extends FavoriteProps {
  stims: Stim[]
}

const COLUMNS: { field: SortField; label: string; title?: string; num?: boolean }[] = [
  { field: 'name', label: 'Stim' },
  { field: 'role', label: 'Role', title: 'What the effect data says it is for — primary tag first' },
  { field: 'buffs', label: 'Buffs', title: 'Positively-signed effects', num: true },
  { field: 'debuffs', label: 'Debuffs', title: 'Negatively-signed effects', num: true },
  { field: 'duration', label: 'Ends', title: 'When the last effect stops (delay + duration)', num: true },
  { field: 'useTime', label: 'Use', title: 'Time to use, and doses per item', num: true },
]

const COL_COUNT = COLUMNS.length + 1 // + the conflict column

/** Seconds → "45s" / "4m". */
function secs(n: number): string {
  if (n <= 0) return '–'
  return n < 120 ? `${n}s` : `${Math.round(n / 60)}m`
}

/** Fewer cancel-outs is better, so the scale is inverted vs the ammo armor grid. */
function conflictTier(n: number): number {
  if (n === 0) return 5
  if (n <= 2) return 4
  if (n <= 4) return 3
  if (n <= 7) return 2
  return 1
}

function effectValue(e: StimEffect): string {
  if (e.presenceOnly) return '·'
  const sign = e.value > 0 ? '+' : e.value < 0 ? '−' : ''
  const mag = Math.abs(e.value)
  if (isPercentType(e.type)) return `${sign}${Math.round(mag * 100)}%`
  return `${sign}${mag}`
}

function signClass(sign: StimEffect['sign']): string {
  return sign === 'buff' ? 'delta-up' : sign === 'debuff' ? 'delta-down' : ''
}

export function StimsView({ stims, favorites, pinned, onToggleFavorite, onTogglePinned }: Props) {
  const [roles, setRoles] = useState<Set<StimRole>>(new Set())
  const [kinds, setKinds] = useState<Set<MedKind>>(new Set())
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  // the hook is generic over its keys, so we store stim ids rather than group names
  const { expanded, toggle, expandAll, collapseAll } = useExpandedGroups('stims')

  const pairings = useMemo(() => buildStimPairings(stims), [stims])

  const allKinds = useMemo(() => {
    const order: MedKind[] = ['Stim', 'Painkiller', 'Food']
    const present = new Set(stims.map((s) => s.kind))
    return order.filter((k) => present.has(k))
  }, [stims])

  const allRoles = useMemo(() => {
    const s = new Set(stims.map((x) => x.role))
    return [...s].sort((a, b) => ROLE_ORDER[a] - ROLE_ORDER[b])
  }, [stims])

  const toggleRole = (r: StimRole) =>
    setRoles((prev) => {
      const next = new Set(prev)
      if (next.has(r)) next.delete(r)
      else next.add(r)
      return next
    })

  const handleSort = (field: SortField) => {
    const numeric = field !== 'name' && field !== 'role'
    if (sortField === field) {
      const first: SortDir = numeric ? 'desc' : 'asc'
      if (sortDir === first) setSortDir(numeric ? 'asc' : 'desc')
      else setSortField(null)
    } else {
      setSortField(field)
      setSortDir(numeric ? 'desc' : 'asc')
    }
  }

  const cancelCount = (id: string) =>
    (pairings.get(id) ?? []).filter((p) => p.kind === 'cancels').length

  const rows = useMemo(() => {
    let list = stims
    if (kinds.size > 0) list = list.filter((s) => kinds.has(s.kind))
    if (roles.size > 0) list = list.filter((s) => s.roles.some((r) => roles.has(r)))
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.shortName.toLowerCase().includes(q) ||
          s.roles.some((r) => r.toLowerCase().includes(q)) ||
          s.cures.some((c) => c.toLowerCase().includes(q)) ||
          s.effects.some((e) => e.label.toLowerCase().includes(q)),
      )
    }
    const m = sortDir === 'asc' ? 1 : -1
    const favFirst = favoritesFirst<Stim>((x) => x.id, favorites, pinned)
    return [...list].sort((a, b) => {
      const fav = favFirst(a, b)
      if (fav !== 0) return fav
      if (!sortField) return ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name)
      if (sortField === 'name') return m * a.name.localeCompare(b.name)
      if (sortField === 'role') {
        return m * (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]) || a.name.localeCompare(b.name)
      }
      if (sortField === 'conflicts') {
        return m * (cancelCount(a.id) - cancelCount(b.id)) || a.name.localeCompare(b.name)
      }
      return m * (a[sortField] - b[sortField]) || a.name.localeCompare(b.name)
    })
    // cancelCount reads `pairings`, which is memoized on `stims`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stims, kinds, roles, search, sortField, sortDir, pairings, favorites, pinned])

  const arrow = (f: SortField) => (sortField === f ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')
  // searching reveals matches without needing to expand them by hand
  const isOpen = (id: string) => search !== '' || expanded.has(id)

  if (stims.length === 0) {
    return <p className="empty-note">No stim data loaded yet — it arrives with the next data refresh.</p>
  }

  return (
    <div className="ammo-view">
      <div className="filter-bar">
        <div className="filter-row">
          <span className="filter-label">Type</span>
          <div className="chip-group">
            {allKinds.map((k) => (
              <button
                key={k}
                className={`chip ${kinds.has(k) ? 'active' : ''}`}
                onClick={() =>
                  setKinds((prev) => {
                    const next = new Set(prev)
                    if (next.has(k)) next.delete(k)
                    else next.add(k)
                    return next
                  })
                }
              >
                {k === 'Food' ? 'Food & drink' : k === 'Painkiller' ? 'Painkillers' : 'Stims'}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <span className="filter-label">Role</span>
          <div className="chip-group">
            {allRoles.map((r) => (
              <button
                key={r}
                className={`chip ${roles.has(r) ? 'active' : ''}`}
                onClick={() => toggleRole(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-row controls">
          <input
            type="search"
            placeholder="Search stims, effects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <FavoritesToggle pinned={pinned} onToggle={onTogglePinned} />
          <button className="clear-btn" onClick={() => expandAll(rows.map((s) => s.id))}>
            Expand all
          </button>
          <button className="clear-btn" onClick={collapseAll}>
            Collapse all
          </button>
          {(roles.size > 0 || kinds.size > 0 || search) && (
            <button
              className="clear-btn"
              onClick={() => {
                setRoles(new Set())
                setKinds(new Set())
                setSearch('')
              }}
            >
              Clear
            </button>
          )}
          <span className="flow-hint">click a row for effects &amp; pairings</span>
        </div>
      </div>

      <div className="table-wrap ammo-scroll">
        <table className="ammo-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.field}
                  title={c.title}
                  className={`sortable ${sortField === c.field ? 'sorted' : ''} ${c.num ? 'num-col' : ''}`}
                  onClick={() => handleSort(c.field)}
                >
                  {c.label}
                  {arrow(c.field)}
                </th>
              ))}
              <th
                className={`rate-col sortable ${sortField === 'conflicts' ? 'sorted' : ''}`}
                title="How many other stims this actively cancels out — 0 is good"
                onClick={() => handleSort('conflicts')}
              >
                ⚠{arrow('conflicts')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <StimRows
                key={s.id}
                stim={s}
                pairings={pairings.get(s.id) ?? []}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
                open={isOpen(s.id)}
                onToggle={() => toggle(s.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="empty-note">No stims match.</p>}
    </div>
  )
}

function StimRows({
  stim,
  pairings,
  open,
  onToggle,
  favorites,
  onToggleFavorite,
}: {
  stim: Stim
  pairings: StimPairing[]
  open: boolean
  onToggle: () => void
  favorites: Set<string>
  onToggleFavorite: (id: string) => void
}) {
  const cancels = pairings.filter((p) => p.kind === 'cancels')
  const complements = pairings.filter((p) => p.kind === 'complements').slice(0, 3)
  const overlaps = pairings.filter((p) => p.kind === 'overlaps')
  const minor = pairings.filter((p) => p.kind === 'minor').length
  const tier = conflictTier(cancels.length)

  const list = (items: StimPairing[]) =>
    items.map((p) => `${p.shortName || p.name} (${p.reasons.join(', ')})`).join(' · ')

  return (
    <>
      <tr className="stim-row" onClick={onToggle}>
        <td className="ammo-name">
          <FavoriteStar id={stim.id} favorites={favorites} onToggle={onToggleFavorite} />
          <span className={`collapse-arrow ${open ? 'open' : ''}`}>&#9654;</span>
          {stim.name}
          {stim.random && (
            <span className="stim-note" title="some of this stim's effects are chance-based">
              {' '}
              ?
            </span>
          )}
        </td>
        <td>
          <div className="badge-group">
            <span className="badge">{stim.role}</span>
            {stim.roles.slice(1).map((r) => (
              <span key={r} className="badge stim-note">
                {r}
              </span>
            ))}
          </div>
        </td>
        <td className={`num-col ${stim.buffs > 0 ? 'delta-up' : ''}`}>{stim.buffs}</td>
        <td className={`num-col ${stim.debuffs > 0 ? 'delta-down' : ''}`}>{stim.debuffs}</td>
        <td className="num-col">{secs(stim.duration)}</td>
        <td className="num-col">
          {stim.useTime > 0 ? `${stim.useTime}s` : '–'}
          {stim.uses > 1 && <span className="stim-note"> ×{stim.uses}</span>}
        </td>
        <td
          className={`rate-col rate-${tier}`}
          title={cancels.length === 0 ? 'cancels nothing out' : `cancels out: ${cancels.map((c) => c.shortName || c.name).join(', ')}`}
        >
          {cancels.length}
        </td>
      </tr>
      {open && (
        <tr className="stim-detail">
          <td colSpan={COL_COUNT}>
            {stim.cures.length > 0 && (
              <div className="badge-group stim-cures">
                <span className="stim-note">Cures</span>
                {stim.cures.map((c) => (
                  <span key={c} className="badge">
                    {c}
                  </span>
                ))}
              </div>
            )}

            <div className="stim-effects">
              {stim.effects.map((e, i) => (
                <div key={`${e.key}-${i}`} className="stim-effect-row">
                  <span>{e.label}</span>
                  <span
                    className={`num-col ${signClass(e.sign)}`}
                    title={e.presenceOnly ? 'the API ships no number for this — its presence is the effect' : undefined}
                  >
                    {effectValue(e)}
                  </span>
                  <span className="stim-note">
                    {isInstantType(e.type) ? 'one-off' : `${e.delay}s → ${e.endsAt}s`}
                  </span>
                  <span className="stim-note">{e.chance < 1 ? `${Math.round(e.chance * 100)}%` : ''}</span>
                </div>
              ))}
            </div>

            {stim.selfReversed.length > 0 && (
              <p className="stim-note stim-line">Reverses its own gain later in the window.</p>
            )}

            <div className="stim-pairs">
              {cancels.length > 0 && (
                <p className="stim-line warn-text">⚠ Cancels out — {list(cancels)}</p>
              )}
              {complements.length > 0 && (
                <p className="stim-line stim-note">Pairs well — {list(complements)}</p>
              )}
              {overlaps.length > 0 && (
                <p className="stim-line stim-note">
                  Redundant with — {list(overlaps.slice(0, 4))}
                  {overlaps.length > 4 && ` +${overlaps.length - 4} more`}
                </p>
              )}
              {minor > 0 && (
                <p className="stim-line stim-note">
                  {minor} minor conflict{minor === 1 ? '' : 's'}
                </p>
              )}
              <p className="stim-line stim-note">
                Pairings are derived from effect-type overlap in the API data only — not verified in
                game, and the game's own stacking rules aren't described by the API.
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
