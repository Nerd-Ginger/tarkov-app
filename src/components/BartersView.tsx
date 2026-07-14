import { useMemo, useState } from 'react'
import type { Barter } from '../types'
import { traderSortKey } from '../data/normalize'
import { FirBadge, TradeList } from './TradeParts'

interface Props {
  barters: Barter[]
}

function matches(b: Barter, s: string): boolean {
  return (
    b.trader.toLowerCase().includes(s) ||
    b.reward.some((r) => r.item.name.toLowerCase().includes(s)) ||
    b.required.some((r) => r.item.name.toLowerCase().includes(s))
  )
}

export function BartersView({ barters }: Props) {
  const [search, setSearch] = useState('')
  const [firOnly, setFirOnly] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

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
    const byTrader = new Map<string, Barter[]>()
    for (const b of list) {
      let g = byTrader.get(b.trader)
      if (!g) byTrader.set(b.trader, (g = []))
      g.push(b)
    }
    return [...byTrader.entries()].sort((a, b) => traderSortKey(a[0]) - traderSortKey(b[0]))
  }, [barters, search, firOnly])

  const toggleGroup = (t: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  // searching should reveal matches even inside collapsed groups
  const isOpen = (t: string) => search !== '' || !collapsed.has(t)

  return (
    <div className="trade-view">
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
          <button className="clear-btn" onClick={() => setCollapsed(new Set())}>Expand all</button>
          <button className="clear-btn" onClick={() => setCollapsed(new Set(allTraders))}>Collapse all</button>
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
              <TraderRows key={trader} trader={trader} rows={rows} open={isOpen(trader)} onToggle={() => toggleGroup(trader)} />
            ))}
          </tbody>
        </table>
      </div>
      {groups.length === 0 && <p className="empty-note">No barters match.</p>}
    </div>
  )
}

function TraderRows({ trader, rows, open, onToggle }: {
  trader: string
  rows: Barter[]
  open: boolean
  onToggle: () => void
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
          <tr key={b.id}>
            <td className="trade-reward">
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
