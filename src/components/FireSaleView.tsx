import { useEffect, useMemo, useState } from 'react'
import type { DataSource, ItemRef, PriceMode, PriceRow, Profile, TraderReset } from '../types'
import { traderSortKey } from '../data/normalize'
import { FLEA, buyOption, perSlot, sellOption } from '../data/tradeAccess'
import type { BuyOption } from '../data/tradeAccess'
import { ResetBanner } from './ResetBanner'
import { BackupApiTag } from './BackupApiTag'
import type { FavoriteProps } from '../hooks/useFavorites'
import { favoritesFirst } from '../data/favorites'
import { FavoriteStar, FavoritesToggle } from './FavoriteStar'

const ROW_CAP = 400
const FILTER_KEY = 'tarkov.fireSaleFilter.v1'

type SortField = 'name' | 'buy' | 'flea' | 'change' | 'sell' | 'margin' | 'perSlot'
type SortDir = 'asc' | 'desc'
type FleaMode = 'all' | 'banned' | 'traderOnly'

interface Props extends FavoriteProps {
  rows: PriceRow[]
  profile: Profile
  /** Traders not unlocked yet — their offers don't count on either side. */
  locked: Set<string>
  traderResets: TraderReset[]
  fetchedAt: number | null
  /** Which upstream served the prices — 'json' means GraphQL was unreachable. */
  source?: DataSource
  /** Which economy's prices are showing. Applies app-wide, not just here. */
  mode: PriceMode
  onSetMode: (mode: PriceMode) => void
  loading: boolean
  offline: boolean
  onRefresh: () => void
  onItemClick: (item: ItemRef) => void
}

/** Per-row market facts, computed once so filters and sorts read numbers. */
interface Decorated {
  p: PriceRow
  buy: BuyOption
  sell: { source: string; price: number } | null
  /** Best obtainable sell price (flea or unlocked trader), for the value floor. */
  value: number
  ps: number
  margin: number | null
}

const MIN_PRICE_OPTIONS = [
  { label: 'All prices', value: 0 },
  { label: 'Value > ₽10k', value: 10_000 },
  { label: 'Value > ₽50k', value: 50_000 },
  { label: 'Value > ₽100k', value: 100_000 },
]

const FLEA_OPTIONS: { label: string; value: FleaMode }[] = [
  { label: 'All items', value: 'all' },
  { label: 'Flea-banned only', value: 'banned' },
  { label: 'Trader-only (hide flea)', value: 'traderOnly' },
]

function rub(n: number | null): string {
  return n === null ? '—' : `₽${Math.round(n).toLocaleString()}`
}

function signedRub(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}₽${Math.abs(Math.round(n)).toLocaleString()}`
}

function timeAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  return `${Math.round(mins / 60)} h ago`
}

interface SavedFilters {
  minPrice: number
  fleaMode: FleaMode
  canBuyOnly: boolean
  traders: string[]
}

function readFilters(): SavedFilters {
  const fallback: SavedFilters = { minPrice: 10_000, fleaMode: 'all', canBuyOnly: false, traders: [] }
  try {
    const raw = localStorage.getItem(FILTER_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<SavedFilters>
    return {
      minPrice: typeof p.minPrice === 'number' ? p.minPrice : fallback.minPrice,
      fleaMode: p.fleaMode === 'banned' || p.fleaMode === 'traderOnly' ? p.fleaMode : 'all',
      canBuyOnly: p.canBuyOnly === true,
      traders: Array.isArray(p.traders) ? p.traders.filter((t): t is string => typeof t === 'string') : [],
    }
  } catch {
    return fallback
  }
}

export function FireSaleView({
  rows,
  profile,
  locked,
  traderResets,
  fetchedAt,
  source,
  mode,
  onSetMode,
  loading,
  offline,
  onRefresh,
  onItemClick,
  favorites,
  pinned,
  onToggleFavorite,
  onTogglePinned,
}: Props) {
  const saved = useMemo(readFilters, [])
  const [search, setSearch] = useState('')
  const [minPrice, setMinPrice] = useState(saved.minPrice)
  const [fleaMode, setFleaMode] = useState<FleaMode>(saved.fleaMode)
  const [canBuyOnly, setCanBuyOnly] = useState(saved.canBuyOnly)
  const [traders, setTraders] = useState<Set<string>>(() => new Set(saved.traders))
  const [sortField, setSortField] = useState<SortField>('perSlot')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    try {
      localStorage.setItem(
        FILTER_KEY,
        JSON.stringify({ minPrice, fleaMode, canBuyOnly, traders: [...traders] }),
      )
    } catch {
      // storage unavailable — filters just won't persist
    }
  }, [minPrice, fleaMode, canBuyOnly, traders])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      // cheapest-first and A-Z are the useful defaults; everything else is "biggest first"
      setSortDir(field === 'name' || field === 'buy' ? 'asc' : 'desc')
    }
  }

  const toggleTrader = (t: string) =>
    setTraders((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })

  // every trader appearing on either side of the market, in canonical order
  const allTraders = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) {
      for (const x of r.sellTo) s.add(x.source)
      for (const b of r.buyFrom) if (b.source !== FLEA) s.add(b.source)
    }
    return [...s].sort((a, b) => traderSortKey(a) - traderSortKey(b))
  }, [rows])

  const decorated = useMemo<Decorated[]>(
    () =>
      rows.map((p) => {
        const buy = buyOption(p, profile, locked)
        const sell = sellOption(p, locked)
        const value = Math.max(p.flea ?? 0, sell?.price ?? 0)
        return {
          p,
          buy,
          sell,
          value,
          ps: perSlot(p, locked),
          // only a trader purchase can produce a spread — flea-to-flea is always zero
          margin: buy.traderBest && value > 0 ? value - buy.traderBest.price : null,
        }
      }),
    [rows, profile, locked],
  )

  const { visible, total } = useMemo(() => {
    let list = decorated
    // cheapest predicates first so the string compare runs on the smallest set
    if (traders.size > 0) {
      list = list.filter(
        (d) =>
          d.p.sellTo.some((s) => traders.has(s.source)) ||
          d.p.buyFrom.some((b) => b.source !== FLEA && traders.has(b.source)),
      )
    }
    if (canBuyOnly) list = list.filter((d) => d.buy.traderBest !== null)
    if (fleaMode === 'banned') list = list.filter((d) => d.p.noFlea)
    else if (fleaMode === 'traderOnly') list = list.filter((d) => !d.p.buyFrom.some((b) => b.source === FLEA))
    if (minPrice > 0) list = list.filter((d) => d.value >= minPrice)
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(
        (d) => d.p.name.toLowerCase().includes(s) || d.p.shortName.toLowerCase().includes(s),
      )
    }
    const m = sortDir === 'asc' ? 1 : -1
    const favFirst = favoritesFirst<Decorated>((d) => d.p.id, favorites, pinned)
    const sorted = [...list].sort((a, b) => {
      const fav = favFirst(a, b)
      if (fav !== 0) return fav
      switch (sortField) {
        case 'name':
          return m * a.p.name.localeCompare(b.p.name)
        case 'buy': {
          // no reachable offer sinks to the bottom in BOTH directions, otherwise
          // the thousands of unbuyable rows swamp the ascending sort
          const av = a.buy.best?.price
          const bv = b.buy.best?.price
          if (av == null || bv == null) return (av == null ? 1 : 0) - (bv == null ? 1 : 0)
          return m * (av - bv) || a.p.name.localeCompare(b.p.name)
        }
        case 'flea':
          return m * ((a.p.flea ?? -1) - (b.p.flea ?? -1)) || a.p.name.localeCompare(b.p.name)
        case 'change':
          return (
            m * ((a.p.change48h ?? -Infinity) - (b.p.change48h ?? -Infinity)) ||
            a.p.name.localeCompare(b.p.name)
          )
        case 'sell':
          return m * ((a.sell?.price ?? -1) - (b.sell?.price ?? -1)) || a.p.name.localeCompare(b.p.name)
        case 'margin': {
          const av = a.margin
          const bv = b.margin
          if (av == null || bv == null) return (av == null ? 1 : 0) - (bv == null ? 1 : 0)
          return m * (av - bv) || a.p.name.localeCompare(b.p.name)
        }
        case 'perSlot':
          return m * (a.ps - b.ps) || a.p.name.localeCompare(b.p.name)
      }
    })
    return { visible: sorted.slice(0, ROW_CAP), total: sorted.length }
  }, [decorated, search, traders, canBuyOnly, fleaMode, minPrice, sortField, sortDir, favorites, pinned])

  const arrow = (f: SortField) => (sortField === f ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  if (rows.length === 0) {
    return (
      <div className="trade-view">
        <p className="empty-note">
          {loading
            ? 'Fetching live prices from tarkov.dev…'
            : offline
              ? "Couldn't reach tarkov.dev — prices need one online fetch. "
              : 'No price data yet. '}
          {!loading && (
            <button className="clear-btn" onClick={onRefresh}>
              Fetch prices
            </button>
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
            {([
              { id: 'pve', label: 'PvE' },
              { id: 'regular', label: 'PvP' },
            ] as const).map((m) => (
              <button
                key={m.id}
                className={`chip ${mode === m.id ? 'active' : ''}`}
                onClick={() => onSetMode(m.id)}
                title={`Show ${m.label} flea prices — applies to every view that shows prices`}
              >
                {m.label}
              </button>
            ))}
            <span className="flow-hint mode-hint">
              separate economies — most items trade at different prices
            </span>
          </div>
        </div>
        <div className="filter-row">
          <span className="filter-label">Traders</span>
          <div className="chip-group">
            {allTraders.map((t) => {
              const isLocked = locked.has(t)
              return (
                <button
                  key={t}
                  className={`chip ${traders.has(t) ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                  onClick={() => toggleTrader(t)}
                  title={isLocked ? `${t} isn't unlocked yet — mark him in Profile` : undefined}
                >
                  {t}
                  {isLocked && ' 🔒'}
                </button>
              )
            })}
            {traders.size > 0 && (
              <button className="clear-btn" onClick={() => setTraders(new Set())}>
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="filter-row controls">
          <input
            type="search"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={minPrice}
            onChange={(e) => setMinPrice(Number(e.target.value))}
            title="Hide items worth less than this to sell"
          >
            {MIN_PRICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={fleaMode}
            onChange={(e) => setFleaMode(e.target.value as FleaMode)}
            title="Flea-banned = trader-sell only. Trader-only = hide anything you can buy on flea."
          >
            {FLEA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FavoritesToggle pinned={pinned} onToggle={onTogglePinned} />
          <label
            className="check-label arena-toggle"
            title="Only items a trader will sell you at your current loyalty (set in Profile). The flea market isn't counted."
          >
            <input type="checkbox" checked={canBuyOnly} onChange={(e) => setCanBuyOnly(e.target.checked)} />
            Can buy
          </label>
          <button className="clear-btn" onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh prices'}
          </button>
          <span className="flow-hint">
            {fetchedAt && <>prices {timeAgo(fetchedAt)}</>}
            {source === 'json' && <BackupApiTag />}
            {offline && <em className="offline"> · offline, showing cached</em>}
          </span>
        </div>
      </div>

      <div className="table-wrap trade-scroll">
        <table className="firesale-table">
          <thead>
            <tr>
              <th className={`sortable ${sortField === 'name' ? 'sorted' : ''}`} onClick={() => handleSort('name')}>
                Item{arrow('name')}
              </th>
              <th
                className={`sortable num-col ${sortField === 'buy' ? 'sorted' : ''}`}
                onClick={() => handleSort('buy')}
                title="Cheapest offer you can actually buy, given your trader loyalty"
              >
                Buy{arrow('buy')}
              </th>
              <th
                className={`sortable num-col ${sortField === 'flea' ? 'sorted' : ''}`}
                onClick={() => handleSort('flea')}
                title="Flea market average over 24h"
              >
                Flea (avg){arrow('flea')}
              </th>
              <th
                className={`sortable num-col ${sortField === 'change' ? 'sorted' : ''}`}
                onClick={() => handleSort('change')}
                title="Flea price change over 48h"
              >
                Δ 48h{arrow('change')}
              </th>
              <th
                className={`sortable num-col ${sortField === 'sell' ? 'sorted' : ''}`}
                onClick={() => handleSort('sell')}
                title="Best price among traders you've unlocked"
              >
                Sell{arrow('sell')}
              </th>
              <th
                className={`sortable num-col ${sortField === 'margin' ? 'sorted' : ''}`}
                onClick={() => handleSort('margin')}
                title="Best sell price minus the cheapest trader offer you can reach — the flip. Flea-to-flea is never a trade, so flea buys don't count."
              >
                Margin{arrow('margin')}
              </th>
              <th
                className={`sortable num-col ${sortField === 'perSlot' ? 'sorted' : ''}`}
                onClick={() => handleSort('perSlot')}
                title="Best sell price ÷ grid slots — the loot-priority metric"
              >
                ₽/slot{arrow('perSlot')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ p, buy, sell, ps, margin }) => {
              const fleaWins = (p.flea ?? 0) > (sell?.price ?? 0)
              return (
                <tr key={p.id}>
                  <td className={p.noFlea ? 'no-flea' : ''}>
                    <FavoriteStar id={p.id} favorites={favorites} onToggle={onToggleFavorite} />
                    <button
                      className="quest-link"
                      onClick={() => onItemClick({ id: p.id, name: p.name, shortName: p.shortName })}
                      title="Item details"
                    >
                      {p.name}
                    </button>
                    {p.noFlea && <span className="no-flea-mark">✱</span>}
                  </td>
                  <td className="num-col">
                    {buy.best ? (
                      <>
                        {rub(buy.best.price)}{' '}
                        <span className="trader-src">
                          {buy.best.source}
                          {buy.best.minLevel > 1 && ` LL${buy.best.minLevel}`}
                        </span>
                        {buy.lockedCheaper && (
                          <span
                            className="buy-locked"
                            title={`${buy.lockedCheaper.source} LL${buy.lockedCheaper.minLevel} sells it for ${rub(buy.lockedCheaper.price)} — you're not there yet`}
                          >
                            🔒
                          </span>
                        )}
                      </>
                    ) : buy.lockedCheaper ? (
                      <span
                        className="buy-locked"
                        title={`Needs ${buy.lockedCheaper.source} LL${buy.lockedCheaper.minLevel}`}
                      >
                        🔒 {rub(buy.lockedCheaper.price)}{' '}
                        <span className="trader-src">
                          {buy.lockedCheaper.source} LL{buy.lockedCheaper.minLevel}
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num-col">{rub(p.flea)}</td>
                  <td
                    className={`num-col ${p.change48h && p.change48h > 0 ? 'delta-up' : p.change48h && p.change48h < 0 ? 'delta-down' : ''}`}
                  >
                    {p.change48h === null ? '—' : `${p.change48h > 0 ? '+' : ''}${p.change48h}%`}
                  </td>
                  <td className="num-col">
                    {p.flea === null && !sell ? (
                      '—'
                    ) : fleaWins ? (
                      <>
                        {rub(p.flea)} <span className="sell-flea">Flea</span>
                      </>
                    ) : (
                      <>
                        {rub(sell!.price)} <span className="sell-trader">{sell!.source}</span>
                      </>
                    )}
                  </td>
                  <td className={`num-col ${margin == null ? '' : margin > 0 ? 'delta-up' : 'delta-down'}`}>
                    {margin == null ? '—' : signedRub(margin)}
                  </td>
                  <td className="num-col flea-price">
                    {ps > 0 ? rub(ps) : '—'}
                    {p.slots > 1 && <span className="trader-src"> ({p.slots})</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {total > ROW_CAP ? (
        <p className="empty-note">
          Showing {ROW_CAP} of {total.toLocaleString()} items — refine the search or raise the value floor.
        </p>
      ) : (
        total === 0 && (
          <p className="empty-note">
            No items match.
            {canBuyOnly && ' “Can buy” only shows what a trader will sell you at your current loyalty — set your trader levels in Profile, or untick it.'}
          </p>
        )
      )}
    </div>
  )
}
