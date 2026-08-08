import { useEffect, useMemo, useState } from 'react'
import type { Barter, Craft, DataSource, ItemRef, PriceMode, PriceRow, Profile } from '../types'
import type { ItemUsage } from '../data/itemUsage'
import type { Acquisition, YardSaleRow } from '../data/yardSale'
import { acquisitionSource, buildYardSale, yardSaleSources } from '../data/yardSale'
import { FLEA } from '../data/tradeAccess'
import { favoritesFirst } from '../data/favorites'
import { duration } from '../data/timeFormat'
import { FavoriteStar, FavoritesToggle } from './FavoriteStar'
import type { FavoriteProps } from '../hooks/useFavorites'
import { ResetBanner } from './ResetBanner'
import { BackupApiTag } from './BackupApiTag'
import type { TraderReset } from '../types'

/**
 * One row per item: every way to get it, next to what it's worth.
 *
 * Replaces Barter, Crafts and Fire Sale. Those three answered thirds of one
 * question — two listed recipes grouped by provider, one listed items with
 * prices — so "what's the cheapest way to get this, and is it worth flipping"
 * meant reading three tabs.
 */

interface Props extends FavoriteProps {
  priceRows: PriceRow[]
  pricesById: Map<string, PriceRow>
  usage: Map<string, ItemUsage>
  profile: Profile
  locked: Set<string>
  built: Set<string>
  done: Set<string>
  traderResets: TraderReset[]
  fetchedAt: number | null
  source?: DataSource
  mode: PriceMode
  onSetMode: (mode: PriceMode) => void
  loading: boolean
  offline: boolean
  onRefresh: () => void
  onItemClick: (item: ItemRef) => void
  onOpenBarter: (barter: Barter) => void
  onOpenCraft: (craft: Craft) => void
}

const FILTER_KEY = 'tarkov.yardSaleFilter.v1'
const LEGACY_FIRESALE_KEY = 'tarkov.fireSaleFilter.v1'
const ROW_CAP = 300

type SortField = 'name' | 'cost' | 'sell' | 'margin' | 'perSlot'
type SortDir = 'asc' | 'desc'
type Kind = 'buy' | 'barter' | 'craft'

const KINDS: { id: Kind; label: string }[] = [
  { id: 'buy', label: 'Buy' },
  { id: 'barter', label: 'Barter' },
  { id: 'craft', label: 'Craft' },
]

const MIN_VALUE_OPTIONS = [
  { value: 0, label: 'Any value' },
  { value: 10_000, label: '> ₽10k' },
  { value: 50_000, label: '> ₽50k' },
  { value: 100_000, label: '> ₽100k' },
]

interface Saved {
  minValue: number
  canGetOnly: boolean
  pricedOnly: boolean
  kinds: Kind[]
  sources: string[]
}

/**
 * Seeded from the old Fire Sale blob so trader chips carry over — except the
 * value floor, which is deliberately reset. Fire Sale defaulted it to ₽10k, and
 * that floor is computed from SELL value, which is 0 for every barter-only item.
 * Carrying it across would hide exactly the rows this merge exists to surface.
 */
function readSaved(): Saved {
  const empty: Saved = { minValue: 0, canGetOnly: false, pricedOnly: false, kinds: [], sources: [] }
  try {
    const raw = localStorage.getItem(FILTER_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Saved>
      return {
        minValue: typeof p.minValue === 'number' ? p.minValue : 0,
        canGetOnly: p.canGetOnly === true,
        pricedOnly: p.pricedOnly === true,
        kinds: Array.isArray(p.kinds) ? (p.kinds.filter((k) => KINDS.some((x) => x.id === k)) as Kind[]) : [],
        sources: Array.isArray(p.sources) ? p.sources.filter((s) => typeof s === 'string') : [],
      }
    }
    const legacy = localStorage.getItem(LEGACY_FIRESALE_KEY)
    if (legacy) {
      const p = JSON.parse(legacy) as { canBuyOnly?: boolean; traders?: string[] }
      return {
        ...empty,
        canGetOnly: p.canBuyOnly === true,
        sources: Array.isArray(p.traders) ? p.traders : [],
      }
    }
  } catch {
    // fall through to defaults
  }
  return empty
}

const rub = (n: number) => `₽${Math.round(n).toLocaleString()}`
const signedRub = (n: number) => `${n < 0 ? '−' : '+'}₽${Math.abs(Math.round(n)).toLocaleString()}`

function ago(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`
}

/** "Mechanic LL2", "Lavatory 3 · 3h 20m", "Prapor LL1". */
function routeLabel(a: Acquisition): string {
  if (a.kind === 'buy') return a.source === FLEA ? 'Flea' : `${a.source} LL${a.minLevel}`
  if (a.kind === 'barter') return `${a.barter.trader} LL${a.barter.level}`
  return `${a.craft.station} ${a.craft.level} · ${duration(a.craft.durationSec)}`
}

function RouteLine({
  a,
  onOpenBarter,
  onOpenCraft,
}: {
  a: Acquisition
  onOpenBarter: (b: Barter) => void
  onOpenCraft: (c: Craft) => void
}) {
  const open =
    a.kind === 'barter' ? () => onOpenBarter(a.barter) : a.kind === 'craft' ? () => onOpenCraft(a.craft) : undefined
  const title =
    a.kind === 'buy'
      ? undefined
      : a.count > 1
        ? `${rub(a.tradeCost)} for ${a.count} — ${a.cost == null ? 'unknown' : rub(a.cost)} each`
        : a.atLeast
          ? 'Some inputs are flea-banned, so the real cost is higher'
          : undefined
  const body = (
    <>
      <span className={`route-kind kind-${a.kind}`}>{a.kind}</span>
      <span className="route-where">{routeLabel(a)}</span>
      <span className="route-cost">
        {a.cost == null ? '?' : (
          <>
            {a.atLeast && <span className="cost-bound">≥</span>}
            {rub(a.cost)}
          </>
        )}
      </span>
      {a.gated && <span className="route-gated" title="You can't take this route yet">🔒</span>}
    </>
  )
  return open ? (
    <button className={`route-line ${a.gated ? 'gated' : ''}`} onClick={open} title={title}>
      {body}
    </button>
  ) : (
    <span className={`route-line static ${a.gated ? 'gated' : ''}`} title={title}>
      {body}
    </span>
  )
}

export function YardSaleView({
  priceRows,
  pricesById,
  usage,
  profile,
  locked,
  built,
  done,
  traderResets,
  fetchedAt,
  source,
  mode,
  onSetMode,
  loading,
  offline,
  onRefresh,
  onItemClick,
  onOpenBarter,
  onOpenCraft,
  favorites,
  pinned,
  onToggleFavorite,
  onTogglePinned,
}: Props) {
  const saved = useMemo(readSaved, [])
  const [search, setSearch] = useState('')
  const [minValue, setMinValue] = useState(saved.minValue)
  const [canGetOnly, setCanGetOnly] = useState(saved.canGetOnly)
  const [pricedOnly, setPricedOnly] = useState(saved.pricedOnly)
  const [kinds, setKinds] = useState<Set<Kind>>(new Set(saved.kinds))
  const [sources, setSources] = useState<Set<string>>(new Set(saved.sources))
  const [sortField, setSortField] = useState<SortField>('perSlot')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    try {
      localStorage.setItem(
        FILTER_KEY,
        JSON.stringify({ minValue, canGetOnly, pricedOnly, kinds: [...kinds], sources: [...sources] }),
      )
    } catch {
      // storage unavailable — filters just won't persist
    }
  }, [minValue, canGetOnly, pricedOnly, kinds, sources])

  const rows = useMemo(
    () => buildYardSale({ priceRows, usage, pricesById, profile, locked, built, done }),
    [priceRows, usage, pricesById, profile, locked, built, done],
  )

  const allSources = useMemo(() => yardSaleSources(rows), [rows])

  const { visible, total } = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = rows.filter((r) => {
      if (pricedOnly && r.acquisitions.some((a) => a.atLeast || a.cost == null)) {
        if (!r.acquisitions.some((a) => !a.atLeast && a.cost != null)) return false
      }
      if (canGetOnly && (r.best === null || r.best.gated)) return false
      if (minValue > 0) {
        const worth = Math.max(r.flea ?? 0, r.sell?.price ?? 0)
        if (worth < minValue) return false
      }
      if (kinds.size > 0 && !r.acquisitions.some((a) => kinds.has(a.kind))) return false
      if (sources.size > 0 && !r.acquisitions.some((a) => sources.has(acquisitionSource(a)))) return false
      if (q) {
        // input names are searched too, so "bolt" still finds what you can
        // barter bolts FOR — the one thread back to the old "You give" column
        const hit =
          r.item.name.toLowerCase().includes(q) ||
          r.item.shortName.toLowerCase().includes(q) ||
          r.acquisitions.some((a) =>
            a.kind === 'buy'
              ? false
              : (a.kind === 'barter' ? a.barter.required : a.craft.required).some((t) =>
                  t.item.name.toLowerCase().includes(q),
                ),
          )
        if (!hit) return false
      }
      return true
    })

    // nulls sink to the bottom whichever way you sort — an unknown isn't a zero
    const num = (v: number | null | undefined) => (v == null ? null : v)
    const cmp = (a: number | null, b: number | null) => {
      if (a == null && b == null) return 0
      if (a == null) return 1
      if (b == null) return -1
      return sortDir === 'asc' ? a - b : b - a
    }
    const byFavorite = favoritesFirst<YardSaleRow>((r) => r.item.id, favorites, pinned)
    const sorted = [...list].sort((x, y) => {
      const fav = byFavorite(x, y)
      if (fav !== 0) return fav
      switch (sortField) {
        case 'name':
          return sortDir === 'asc' ? x.item.name.localeCompare(y.item.name) : y.item.name.localeCompare(x.item.name)
        case 'cost':
          return cmp(num(x.best?.cost), num(y.best?.cost))
        case 'sell':
          return cmp(Math.max(x.flea ?? 0, x.sell?.price ?? 0) || null, Math.max(y.flea ?? 0, y.sell?.price ?? 0) || null)
        case 'margin':
          return cmp(num(x.margin), num(y.margin))
        case 'perSlot':
          return cmp(x.perSlot || null, y.perSlot || null)
      }
    })
    return { visible: sorted.slice(0, ROW_CAP), total: sorted.length }
  }, [rows, search, minValue, canGetOnly, pricedOnly, kinds, sources, sortField, sortDir, favorites, pinned])

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortField(f)
      setSortDir(f === 'name' ? 'asc' : 'desc')
    }
  }
  const arrow = (f: SortField) => (sortField === f ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  const toggleIn = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  /**
   * Only truly empty when there is nothing to show from EITHER source.
   *
   * Barters and crafts come from the bundled snapshot and need no network;
   * prices are fetched lazily. Gating this on prices alone would hand an offline
   * user a "Fetch prices" screen in place of 866 perfectly good barter and craft
   * rows — a straight regression on what the old Barter tab did.
   */
  if (rows.length === 0) {
    return (
      <div className="trade-view">
        <p className="empty-note">
          {loading
            ? 'Loading…'
            : offline
              ? "Offline and nothing cached yet — barters and crafts will show as soon as data loads once."
              : 'No data yet.'}
          {!loading && (
            <>
              {' '}
              <button className="clear-btn" onClick={onRefresh}>
                Fetch prices
              </button>
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="trade-view">
      <ResetBanner resets={traderResets} />

      <div className="filter-bar">
        <div className="filter-row">
          <span className="filter-label">Economy</span>
          <div className="chip-group">
            <button className={`chip ${mode === 'pve' ? 'active' : ''}`} onClick={() => onSetMode('pve')}>
              PvE
            </button>
            <button className={`chip ${mode === 'regular' ? 'active' : ''}`} onClick={() => onSetMode('regular')}>
              PvP
            </button>
          </div>
        </div>

        <div className="filter-row">
          <span className="filter-label">How</span>
          <div className="chip-group">
            {KINDS.map((k) => (
              <button
                key={k.id}
                className={`chip ${kinds.has(k.id) ? 'active' : ''}`}
                onClick={() => setKinds((s) => toggleIn(s, k.id))}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-row">
          <span className="filter-label">From</span>
          <div className="chip-group">
            {allSources.map((s) => (
              <button
                key={s}
                className={`chip ${sources.has(s) ? 'active' : ''} ${locked.has(s) ? 'locked' : ''}`}
                onClick={() => setSources((prev) => toggleIn(prev, s))}
              >
                {s}
              </button>
            ))}
            {sources.size > 0 && (
              <button className="clear-btn" onClick={() => setSources(new Set())}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="filter-row controls">
          <input
            type="search"
            placeholder="Search items or inputs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={minValue} onChange={(e) => setMinValue(Number(e.target.value))}>
            {MIN_VALUE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FavoritesToggle pinned={pinned} onToggle={onTogglePinned} />
          <label className="check-label arena-toggle" title="Only routes you can take at your current levels.">
            <input type="checkbox" checked={canGetOnly} onChange={(e) => setCanGetOnly(e.target.checked)} />
            Can get
          </label>
          <label
            className="check-label"
            title="Hide routes whose cost is only a floor because some inputs are flea-banned. Nearly half of all barters are like this."
          >
            <input type="checkbox" checked={pricedOnly} onChange={(e) => setPricedOnly(e.target.checked)} />
            Fully priced
          </label>
          <button className="clear-btn" onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh prices'}
          </button>
          <span className="flow-hint">
            {fetchedAt && <>prices {ago(fetchedAt)}</>}
            {source === 'graphql' && <BackupApiTag />}
            {offline && <em className="offline"> · offline, showing cached</em>}
          </span>
        </div>
      </div>

      <div className="table-wrap trade-scroll">
        <table className="yardsale-table">
          <thead>
            <tr>
              <th className={`sortable ${sortField === 'name' ? 'sorted' : ''}`} onClick={() => handleSort('name')}>
                Item{arrow('name')}
              </th>
              <th>Get it</th>
              <th className={`num-col sortable ${sortField === 'cost' ? 'sorted' : ''}`} onClick={() => handleSort('cost')}>
                Best cost{arrow('cost')}
              </th>
              <th className={`num-col sortable ${sortField === 'sell' ? 'sorted' : ''}`} onClick={() => handleSort('sell')}>
                Sell for{arrow('sell')}
              </th>
              <th className={`num-col sortable ${sortField === 'margin' ? 'sorted' : ''}`} onClick={() => handleSort('margin')}>
                Margin{arrow('margin')}
              </th>
              <th
                className={`num-col sortable ${sortField === 'perSlot' ? 'sorted' : ''}`}
                onClick={() => handleSort('perSlot')}
              >
                ₽/slot{arrow('perSlot')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <Row
                key={r.item.id}
                row={r}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
                onItemClick={onItemClick}
                onOpenBarter={onOpenBarter}
                onOpenCraft={onOpenCraft}
              />
            ))}
          </tbody>
        </table>
      </div>

      {total > ROW_CAP ? (
        <p className="empty-note">
          Showing {ROW_CAP} of {total} items — narrow it with the search or the filters above.
        </p>
      ) : total === 0 ? (
        <p className="empty-note">
          No items match.
          {canGetOnly && ' Turn off Can get to include routes above your trader or station levels.'}
        </p>
      ) : null}
    </div>
  )
}

function Row({
  row,
  favorites,
  onToggleFavorite,
  onItemClick,
  onOpenBarter,
  onOpenCraft,
}: {
  row: YardSaleRow
  favorites: Set<string>
  onToggleFavorite: (id: string) => void
  onItemClick: (item: ItemRef) => void
  onOpenBarter: (b: Barter) => void
  onOpenCraft: (c: Craft) => void
}) {
  // cheapest first, so the headline route is the top line
  const ordered = [...row.acquisitions].sort((a, b) => {
    if (a.gated !== b.gated) return a.gated ? 1 : -1
    if ((a.cost == null) !== (b.cost == null)) return a.cost == null ? 1 : -1
    return (a.cost ?? 0) - (b.cost ?? 0)
  })
  const shown = ordered.slice(0, 3)
  const sellBest = Math.max(row.flea ?? 0, row.sell?.price ?? 0)

  return (
    <tr>
      <td className={row.noFlea ? 'no-flea' : ''}>
        <FavoriteStar id={row.item.id} favorites={favorites} onToggle={onToggleFavorite} />
        <button className="quest-link" onClick={() => onItemClick(row.item)} title="Item details">
          {row.item.name}
        </button>
        {row.noFlea && <span className="no-flea-mark" title="Flea-banned — trader only">✱</span>}
      </td>
      <td>
        <div className="route-list">
          {shown.map((a, i) => (
            <RouteLine key={i} a={a} onOpenBarter={onOpenBarter} onOpenCraft={onOpenCraft} />
          ))}
          {ordered.length > shown.length && (
            <span className="route-more">+{ordered.length - shown.length} more</span>
          )}
          {ordered.length === 0 && <span className="route-more">—</span>}
        </div>
      </td>
      <td className="num-col">
        {row.best?.cost == null ? (
          <span className="route-more">?</span>
        ) : (
          <>
            {row.best.atLeast && <span className="cost-bound">≥</span>}
            {rub(row.best.cost)}
          </>
        )}
      </td>
      <td className="num-col">
        {sellBest > 0 ? (
          <span className={row.flea && row.flea >= (row.sell?.price ?? 0) ? 'sell-flea' : 'sell-trader'}>
            {rub(sellBest)}
          </span>
        ) : (
          <span className="route-more">—</span>
        )}
      </td>
      <td className="num-col">
        {row.margin == null ? (
          <span className="route-more">—</span>
        ) : (
          <span className={row.margin >= 0 ? 'delta-up' : 'delta-down'}>{signedRub(row.margin)}</span>
        )}
      </td>
      <td className="num-col flea-price">{row.perSlot > 0 ? rub(row.perSlot) : <span className="route-more">—</span>}</td>
    </tr>
  )
}
