import { useMemo, useState } from 'react'
import type { Quest, StationLevel } from '../types'
import type { Inventory } from '../hooks/useInventory'
import { aggregateNeeds } from '../data/items'
import type { ItemNeed } from '../data/items'

type Source = 'all' | 'quests' | 'hideout'
type SortField = 'name' | 'needed' | 'have' | 'short'
type SortDir = 'asc' | 'desc'

const fmt = (n: number) => n.toLocaleString('en-US')

function neededFor(need: ItemNeed, source: Source): number {
  if (source === 'quests') return need.questCount
  if (source === 'hideout') return need.hideoutCount
  return need.total
}

interface Props {
  quests: Quest[]
  done: Set<string>
  stations: StationLevel[]
  built: Set<string>
  inventory: Inventory
  onSetCount: (itemId: string, count: number) => void
  onQuestClick: (q: Quest) => void
}

export function ItemsView({ quests, done, stations, built, inventory, onSetCount, onQuestClick }: Props) {
  const [source, setSource] = useState<Source>('all')
  const [search, setSearch] = useState('')
  const [hideCovered, setHideCovered] = useState(false)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const needs = useMemo(
    () => aggregateNeeds(quests, done, stations, built),
    [quests, done, stations, built],
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = needs.filter((n) => neededFor(n, source) > 0)
    if (q) {
      list = list.filter(
        (n) => n.item.name.toLowerCase().includes(q) || n.item.shortName.toLowerCase().includes(q),
      )
    }
    if (hideCovered) {
      list = list.filter((n) => neededFor(n, source) > (inventory[n.item.id] ?? 0))
    }
    const m = sortDir === 'asc' ? 1 : -1
    const val = (n: ItemNeed): number | string => {
      const needed = neededFor(n, source)
      const have = inventory[n.item.id] ?? 0
      switch (sortField) {
        case 'name': return n.item.name.toLowerCase()
        case 'needed': return needed
        case 'have': return have
        case 'short': return Math.max(0, needed - have)
      }
    }
    return [...list].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return m * cmp || a.item.name.localeCompare(b.item.name)
    })
  }, [needs, source, search, hideCovered, sortField, sortDir, inventory])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else {
      setSortField(field)
      setSortDir(field === 'name' ? 'asc' : 'desc')
    }
  }
  const arrow = (f: SortField) => (sortField === f ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  const totalShort = rows.reduce(
    (s, n) => s + Math.max(0, neededFor(n, source) - (inventory[n.item.id] ?? 0)),
    0,
  )

  return (
    <div className="items-view">
      <div className="filter-bar">
        <div className="filter-row controls">
          <div className="chip-group">
            {(['all', 'quests', 'hideout'] as const).map((s) => (
              <button key={s} className={`chip ${source === s ? 'active' : ''}`} onClick={() => setSource(s)}>
                {s === 'all' ? 'All' : s === 'quests' ? 'Quests' : 'Hideout'}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="check-label">
            <input type="checkbox" checked={hideCovered} onChange={(e) => setHideCovered(e.target.checked)} />
            Hide covered
          </label>
          <span className="items-summary">
            {rows.length} items · {fmt(totalShort)} still to find
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty-note">Nothing needed — either all covered or no matches.</p>
      ) : (
        <div className="table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th className={`sortable ${sortField === 'name' ? 'sorted' : ''}`} onClick={() => handleSort('name')}>
                  Item{arrow('name')}
                </th>
                <th className={`count-col sortable ${sortField === 'needed' ? 'sorted' : ''}`} onClick={() => handleSort('needed')}>
                  Needed{arrow('needed')}
                </th>
                <th className={`count-col sortable ${sortField === 'have' ? 'sorted' : ''}`} onClick={() => handleSort('have')}>
                  Have{arrow('have')}
                </th>
                <th className={`count-col sortable ${sortField === 'short' ? 'sorted' : ''}`} onClick={() => handleSort('short')}>
                  Short{arrow('short')}
                </th>
                <th>Needed by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => {
                const needed = neededFor(n, source)
                const have = inventory[n.item.id] ?? 0
                const short = Math.max(0, needed - have)
                const fir = source === 'hideout' ? 0 : n.questFirCount
                return (
                  <tr key={n.item.id} className={short === 0 ? 'covered' : ''}>
                    <td className="item-name" title={n.item.name}>
                      {n.item.name}
                    </td>
                    <td className="count-col">
                      <span className="count">{fmt(needed)}</span>
                      {fir > 0 && (
                        <span className="fir-badge" title="Must be found in raid">
                          {fmt(fir)} FIR
                        </span>
                      )}
                    </td>
                    <td className="count-col">
                      <input
                        type="number"
                        min={0}
                        className="have-input"
                        value={have === 0 ? '' : have}
                        placeholder="0"
                        onChange={(e) => onSetCount(n.item.id, Math.max(0, Number(e.target.value) || 0))}
                      />
                    </td>
                    <td className="count-col">
                      <span className={short === 0 ? 'count all-done' : 'count short-count'}>{fmt(short)}</span>
                    </td>
                    <td>
                      <div className="quest-chips">
                        {source !== 'hideout' &&
                          n.questSources.map((s) => (
                            <button
                              key={s.quest.id}
                              className="quest-chip"
                              title={`${s.quest.trader} · Lv ${s.quest.minLevel} — needs ${fmt(s.count)}${s.foundInRaid ? ' (FIR)' : ''}`}
                              onClick={() => onQuestClick(s.quest)}
                            >
                              {s.quest.name} ×{fmt(s.count)}
                            </button>
                          ))}
                        {source !== 'quests' &&
                          n.stationSources.map((s) => (
                            <span key={s.level.key} className="badge map-badge station-badge">
                              {s.level.stationName} {s.level.level} ×{fmt(s.count)}
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
