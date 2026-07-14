import { useEffect, useMemo, useState } from 'react'
import type { Craft } from '../types'
import { FirBadge, TradeList } from './TradeParts'

const FILTER_KEY = 'tarkov.craftFilter.v1'

interface Props {
  crafts: Craft[]
  /** Built hideout levels, keys `${stationId}:${level}` (from useHideout). */
  built: Set<string>
  onOpen: (craft: Craft) => void
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function matches(c: Craft, s: string): boolean {
  return (
    c.station.toLowerCase().includes(s) ||
    c.reward.some((r) => r.item.name.toLowerCase().includes(s)) ||
    c.required.some((r) => r.item.name.toLowerCase().includes(s))
  )
}

export function CraftsView({ crafts, built, onOpen }: Props) {
  const [search, setSearch] = useState('')
  const [firOnly, setFirOnly] = useState(false)
  const [hideoutTracking, setHideoutTracking] = useState(() => localStorage.getItem(FILTER_KEY) === '1')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, hideoutTracking ? '1' : '0')
    } catch {
      // fine — toggle just won't persist
    }
  }, [hideoutTracking])

  // stationId -> highest built level
  const maxBuilt = useMemo(() => {
    const m = new Map<string, number>()
    for (const key of built) {
      const i = key.lastIndexOf(':')
      const id = key.slice(0, i)
      const lvl = Number.parseInt(key.slice(i + 1), 10)
      if (!Number.isNaN(lvl)) m.set(id, Math.max(m.get(id) ?? 0, lvl))
    }
    return m
  }, [built])

  const canCraft = (c: Craft) => (maxBuilt.get(c.stationId) ?? 0) >= c.level

  const allStations = useMemo(() => {
    const s = new Set(crafts.map((c) => c.station))
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [crafts])

  const groups = useMemo(() => {
    let list = crafts
    if (search) {
      const s = search.toLowerCase()
      list = list.filter((c) => matches(c, s))
    }
    if (firOnly) list = list.filter((c) => c.fir)
    if (hideoutTracking) list = list.filter(canCraft)
    const byStation = new Map<string, Craft[]>()
    for (const c of list) {
      let g = byStation.get(c.station)
      if (!g) byStation.set(c.station, (g = []))
      g.push(c)
    }
    return [...byStation.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [crafts, search, firOnly, hideoutTracking, maxBuilt])

  const toggleGroup = (s: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const isOpen = (s: string) => search !== '' || !collapsed.has(s)

  return (
    <div className="trade-view">
      <div className="filter-bar">
        <div className="filter-row controls">
          <input
            type="search"
            placeholder="Search items or stations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="check-label">
            <input type="checkbox" checked={firOnly} onChange={(e) => setFirOnly(e.target.checked)} />
            FIR crafts only
          </label>
          <label
            className="check-label arena-toggle"
            title="Only show crafts your tracked hideout can actually make (uses the station levels you've marked built in the Hideout view)."
          >
            <input
              type="checkbox"
              checked={hideoutTracking}
              onChange={(e) => setHideoutTracking(e.target.checked)}
            />
            Hideout tracking
          </label>
          <button className="clear-btn" onClick={() => setCollapsed(new Set())}>Expand all</button>
          <button className="clear-btn" onClick={() => setCollapsed(new Set(allStations))}>Collapse all</button>
          <span className="flow-hint">✱ = flea-banned item, find in raid</span>
        </div>
      </div>

      <div className="table-wrap trade-scroll">
        <table className="trade-table">
          <thead>
            <tr>
              <th>You get</th>
              <th>You give</th>
              <th className="num-col" title="Station level required">Lv</th>
              <th className="num-col" title="Craft duration">Time</th>
              <th className="fir-col" title="Needs flea-banned items — find in raid">FIR</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([station, rows]) => (
              <StationRows
                key={station}
                station={station}
                rows={rows}
                open={isOpen(station)}
                onToggle={() => toggleGroup(station)}
                tracking={hideoutTracking}
                onOpen={onOpen}
              />
            ))}
          </tbody>
        </table>
      </div>
      {groups.length === 0 && (
        <p className="empty-note">
          {hideoutTracking
            ? 'No craftable recipes match — build station levels in the Hideout view, or turn off Hideout tracking.'
            : 'No crafts match.'}
        </p>
      )}
    </div>
  )
}

function StationRows({ station, rows, open, onToggle, tracking, onOpen }: {
  station: string
  rows: Craft[]
  open: boolean
  onToggle: () => void
  tracking: boolean
  onOpen: (craft: Craft) => void
}) {
  return (
    <>
      <tr className="caliber-row" onClick={onToggle}>
        <td colSpan={5}>
          <span className={`collapse-arrow ${open ? 'open' : ''}`}>&#9654;</span>
          {station}
          <span className="caliber-count">
            {rows.length} craft{rows.length === 1 ? '' : 's'}
            {tracking && ' craftable'}
          </span>
        </td>
      </tr>
      {open &&
        rows.map((c) => (
          <tr key={c.id} className="trade-row" onClick={() => onOpen(c)} title="View unlock requirements">
            <td className="trade-reward">
              <TradeList items={c.reward} />
            </td>
            <td>
              <TradeList items={c.required} />
            </td>
            <td className="num-col">{c.level}</td>
            <td className="num-col">{formatDuration(c.durationSec)}</td>
            <td className="fir-col">{c.fir && <FirBadge />}</td>
          </tr>
        ))}
    </>
  )
}
