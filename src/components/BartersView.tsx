import { useEffect, useMemo, useState } from 'react'
import type { Barter, Profile, TraderReset } from '../types'
import { traderSortKey } from '../data/normalize'
import { traderLoyalty } from '../hooks/useProfile'
import { useExpandedGroups } from '../hooks/useExpandedGroups'
import { FirBadge, TradeList } from './TradeParts'
import { ResetBanner } from './ResetBanner'
import type { FavoriteProps } from '../hooks/useFavorites'
import { groupIsOpen, withFavoritesGroup } from '../data/favorites'
import { FavoriteStar, FavoritesToggle } from './FavoriteStar'

const FILTER_KEY = 'tarkov.barterFilter.v1'

interface Props extends FavoriteProps {
  barters: Barter[]
  profile: Profile
  done: Set<string>
  traderResets: TraderReset[]
  onOpen: (barter: Barter) => void
}

function matches(b: Barter, s: string): boolean {
  return (
    b.trader.toLowerCase().includes(s) ||
    b.reward.some((r) => r.item.name.toLowerCase().includes(s)) ||
    b.required.some((r) => r.item.name.toLowerCase().includes(s))
  )
}

export function BartersView({
  barters,
  profile,
  done,
  traderResets,
  onOpen,
  favorites,
  pinned,
  onToggleFavorite,
  onTogglePinned,
}: Props) {
  const [search, setSearch] = useState('')
  const [firOnly, setFirOnly] = useState(false)
  const [canBuyOnly, setCanBuyOnly] = useState(() => localStorage.getItem(FILTER_KEY) === '1')
  const { expanded, toggle: toggleGroup, expandAll, collapseAll } = useExpandedGroups('barters')

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, canBuyOnly ? '1' : '0')
    } catch {
      // fine — toggle just won't persist
    }
  }, [canBuyOnly])

  // Accessible now = trader leveled high enough AND (no quest gate, or it's done).
  const canBuy = (b: Barter) =>
    traderLoyalty(profile, b.trader) >= b.level && (!b.unlockQuest || done.has(b.unlockQuest.id))

  const allTraders = useMemo(() => {
    const s = new Set(barters.map((b) => b.trader))
    return [...s].sort((a, b) => traderSortKey(a) - traderSortKey(b))
  }, [barters])

  const groups = useMemo(() => {
    let list = barters
    if (search) {
      const s = search.toLowerCase()
      list = list.filter((b) => matches(b, s))
    }
    if (firOnly) list = list.filter((b) => b.fir)
    if (canBuyOnly) list = list.filter(canBuy)
    const byTrader = new Map<string, Barter[]>()
    for (const b of list) {
      let g = byTrader.get(b.trader)
      if (!g) byTrader.set(b.trader, (g = []))
      g.push(b)
    }
    const entries = [...byTrader.entries()].sort((a, b) => traderSortKey(a[0]) - traderSortKey(b[0]))
    return withFavoritesGroup(entries, (b) => b.id, favorites, pinned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barters, search, firOnly, canBuyOnly, profile, done, favorites, pinned])

  // default collapsed; searching reveals matches even inside collapsed groups
  const isOpen = (t: string) => groupIsOpen(t, expanded, search)

  return (
    <div className="trade-view">
      <ResetBanner resets={traderResets} />
      <div className="filter-bar">
        <div className="filter-row controls">
          <input
            type="search"
            placeholder="Search items or traders…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="check-label">
            <input type="checkbox" checked={firOnly} onChange={(e) => setFirOnly(e.target.checked)} />
            FIR barters only
          </label>
          <label
            className="check-label arena-toggle"
            title="Only show barters you can access now — trader leveled high enough (set in Profile) and any quest unlock completed."
          >
            <input type="checkbox" checked={canBuyOnly} onChange={(e) => setCanBuyOnly(e.target.checked)} />
            Can buy
          </label>
          <FavoritesToggle pinned={pinned} onToggle={onTogglePinned} />
          <button className="clear-btn" onClick={() => expandAll(allTraders)}>Expand all</button>
          <button className="clear-btn" onClick={collapseAll}>Collapse all</button>
          <span className="flow-hint">✱ = flea-banned item, find in raid</span>
        </div>
      </div>

      <div className="table-wrap trade-scroll">
        <table className="trade-table">
          <thead>
            <tr>
              <th>You get</th>
              <th>You give</th>
              <th className="num-col" title="Trader loyalty level required">LL</th>
              <th title="Quest that unlocks this barter">Unlock</th>
              <th className="fir-col" title="Needs flea-banned items — find in raid">FIR</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([trader, rows]) => (
              <TraderRows
                key={trader}
                trader={trader}
                rows={rows}
                open={isOpen(trader)}
                onToggle={() => toggleGroup(trader)}
                onOpen={onOpen}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </tbody>
        </table>
      </div>
      {groups.length === 0 && (
        <p className="empty-note">
          {canBuyOnly
            ? 'No accessible barters match — raise trader levels in Profile, or turn off Can buy.'
            : 'No barters match.'}
        </p>
      )}
    </div>
  )
}

function TraderRows({ trader, rows, open, onToggle, onOpen, favorites, onToggleFavorite }: {
  trader: string
  rows: Barter[]
  open: boolean
  onToggle: () => void
  onOpen: (barter: Barter) => void
  favorites: Set<string>
  onToggleFavorite: (id: string) => void
}) {
  return (
    <>
      <tr className="caliber-row" onClick={onToggle}>
        <td colSpan={5}>
          <span className={`collapse-arrow ${open ? 'open' : ''}`}>&#9654;</span>
          {trader}
          <span className="caliber-count">{rows.length} barter{rows.length === 1 ? '' : 's'}</span>
        </td>
      </tr>
      {open &&
        rows.map((b) => (
          <tr key={b.id} className="trade-row" onClick={() => onOpen(b)} title="View unlock requirements">
            <td className="trade-reward">
              <FavoriteStar id={b.id} favorites={favorites} onToggle={onToggleFavorite} />
              <TradeList items={b.reward} />
            </td>
            <td>
              <TradeList items={b.required} />
            </td>
            <td className="num-col">LL{b.level}</td>
            <td className="trade-unlock">{b.unlockQuest ? b.unlockQuest.name : ''}</td>
            <td className="fir-col">{b.fir && <FirBadge />}</td>
          </tr>
        ))}
    </>
  )
}
