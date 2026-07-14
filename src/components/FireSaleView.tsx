import { useMemo, useState } from 'react'
import type { PriceRow } from '../types'

const ROW_CAP = 400

type SortField = 'name' | 'flea' | 'change' | 'trader'
type SortDir = 'asc' | 'desc'

interface Props {
  rows: PriceRow[]
  fetchedAt: number | null
  loading: boolean
  offline: boolean
  onRefresh: () => void
}

const MIN_PRICE_OPTIONS = [
  { label: 'All prices', value: 0 },
  { label: '> ₽10k', value: 10_000 },
  { label: '> ₽50k', value: 50_000 },
  { label: '> ₽100k', value: 100_000 },
]

function rub(n: number | null): string {
  return n === null ? '—' : `₽${Math.round(n).toLocaleString()}`
}

function timeAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  return `${Math.round(mins / 60)} h ago`
}

/** Cap a trader source name ("therapist" → "Therapist"). */
function traderLabel(source: string): string {
  return source ? source.charAt(0).toUpperCase() + source.slice(1) : ''
}

export function FireSaleView({ rows, fetchedAt, loading, offline, onRefresh }: Props) {
  const [search, setSearch] = useState('')
  const [bannedOnly, setBannedOnly] = useState(false)
  const [minPrice, setMinPrice] = useState(10_000)
  const [sortField, setSortField] = useState<SortField>('flea')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'name' ? 'asc' : 'desc')
    }
  }

  const { visible, total } = useMemo(() => {
    let list = rows
    if (search) {
      const s = search.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(s) || p.shortName.toLowerCase().includes(s))
    }
    if (bannedOnly) list = list.filter((p) => p.noFlea)
    if (minPrice > 0) list = list.filter((p) => Math.max(p.flea ?? 0, p.trader) >= minPrice)
    const m = sortDir === 'asc' ? 1 : -1
    const sorted = [...list].sort((a, b) => {
      switch (sortField) {
        case 'name':
          return m * a.name.localeCompare(b.name)
        case 'flea':
          return m * ((a.flea ?? -1) - (b.flea ?? -1)) || a.name.localeCompare(b.name)
        case 'change':
          return m * ((a.change48h ?? -Infinity) - (b.change48h ?? -Infinity)) || a.name.localeCompare(b.name)
        case 'trader':
          return m * (a.trader - b.trader) || a.name.localeCompare(b.name)
      }
    })
    return { visible: sorted.slice(0, ROW_CAP), total: sorted.length }
  }, [rows, search, bannedOnly, minPrice, sortField, sortDir])

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
      <div className="filter-bar">
        <div className="filter-row controls">
          <input
            type="search"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))}>
            {MIN_PRICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="check-label" title="Only items banned from the flea market — trader-sell only">
            <input type="checkbox" checked={bannedOnly} onChange={(e) => setBannedOnly(e.target.checked)} />
            Flea-banned only
          </label>
          <button className="clear-btn" onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh prices'}
          </button>
          <span className="flow-hint">
            {fetchedAt && <>prices {timeAgo(fetchedAt)}</>}
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
                className={`sortable num-col ${sortField === 'trader' ? 'sorted' : ''}`}
                onClick={() => handleSort('trader')}
                title="Best trader sell price, in roubles"
              >
                Trader{arrow('trader')}
              </th>
              <th title="Who pays more for this item">Sell to</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const fleaWins = (p.flea ?? 0) > p.trader
              return (
                <tr key={p.id}>
                  <td className={p.noFlea ? 'no-flea' : ''}>
                    {p.name}
                    {p.noFlea && <span className="no-flea-mark">✱</span>}
                  </td>
                  <td className="num-col">{rub(p.flea)}</td>
                  <td
                    className={`num-col ${p.change48h && p.change48h > 0 ? 'delta-up' : p.change48h && p.change48h < 0 ? 'delta-down' : ''}`}
                  >
                    {p.change48h === null ? '—' : `${p.change48h > 0 ? '+' : ''}${p.change48h}%`}
                  </td>
                  <td className="num-col">
                    {p.trader > 0 ? (
                      <>
                        {rub(p.trader)} <span className="trader-src">{traderLabel(p.traderName)}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {p.flea === null && p.trader === 0 ? (
                      '—'
                    ) : fleaWins ? (
                      <span className="sell-flea">Flea</span>
                    ) : (
                      <span className="sell-trader">{traderLabel(p.traderName) || 'Trader'}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {total > ROW_CAP ? (
        <p className="empty-note">
          Showing {ROW_CAP} of {total.toLocaleString()} items — refine the search or raise the price floor.
        </p>
      ) : (
        total === 0 && <p className="empty-note">No items match.</p>
      )}
    </div>
  )
}
