import { useMemo, useState } from 'react'
import type { Quest } from '../types'
import { EVENT_MAPS, PSEUDO_MAPS, isPseudoMap, traderSortKey } from '../data/normalize'
import { LightkeeperMark } from './LightkeeperMark'

type SortField = 'name' | 'trader' | 'level' | 'kappa'
type SortDir = 'asc' | 'desc'

function comparator(field: SortField, dir: SortDir) {
  const m = dir === 'asc' ? 1 : -1
  return (a: Quest, b: Quest): number => {
    switch (field) {
      case 'name':
        return m * a.name.localeCompare(b.name)
      case 'trader':
        return m * (traderSortKey(a.trader) - traderSortKey(b.trader)) || a.name.localeCompare(b.name)
      case 'level':
        return m * (a.minLevel - b.minLevel) || a.name.localeCompare(b.name)
      case 'kappa': {
        const ak = a.kappa ? 1 : 0
        const bk = b.kappa ? 1 : 0
        return m * (bk - ak) || a.name.localeCompare(b.name)
      }
    }
  }
}

interface Props {
  quests: Quest[]
  done: Set<string>
  active: Set<string>
  onToggleDone: (id: string) => void
  onQuestClick: (quest: Quest) => void
  seriesStats: Map<string, { total: number; done: number }>
  onSeriesClick: (series: string) => void
}

function SortHeader({ label, field, active, dir, onSort, className }: {
  label: string; field: SortField; active: boolean; dir: SortDir
  onSort: (f: SortField) => void; className?: string
}) {
  const arrow = active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''
  return (
    <th className={`sortable ${className ?? ''} ${active ? 'sorted' : ''}`} onClick={() => onSort(field)}>
      {label}{arrow}
    </th>
  )
}

export function QuestsTable({ quests, done, active, onToggleDone, onQuestClick, seriesStats, onSeriesClick }: Props) {
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const sorted = useMemo(() => {
    const base = sortField ? [...quests].sort(comparator(sortField, sortDir)) : [...quests]
    // Quests you're actively running pin to the top, whatever the sort. Array.sort
    // is stable, so the chosen ordering is preserved within each group.
    return base.sort((a, b) => Number(active.has(b.id)) - Number(active.has(a.id)))
  }, [quests, sortField, sortDir, active])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortField(null); setSortDir('asc') }
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  if (quests.length === 0) return <p className="empty-note">No quests match the current filters.</p>

  return (
    <div className="table-wrap">
    <table className="quests-table">
      <thead>
        <tr>
          <th className="done-col">✓</th>
          <SortHeader label="Quest" field="name" active={sortField === 'name'} dir={sortDir} onSort={handleSort} />
          <SortHeader label="Trader" field="trader" active={sortField === 'trader'} dir={sortDir} onSort={handleSort} />
          <SortHeader label="Lv" field="level" active={sortField === 'level'} dir={sortDir} onSort={handleSort} className="level-col" />
          <SortHeader label="κ" field="kappa" active={sortField === 'kappa'} dir={sortDir} onSort={handleSort} className="kappa-col" />
          <th className="lk-col" title="🔦 Lightkeeper questline · ● on the path to unlock Lightkeeper">🔦</th>
          <th>Objectives</th>
          <th>Maps</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((q) => {
          const isDone = done.has(q.id)
          return (
            <tr key={q.id} className={isDone ? 'done' : ''}>
              <td className="done-col">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => onToggleDone(q.id)}
                  aria-label={`Mark ${q.name} done`}
                />
              </td>
              <td className="quest-name">
                <button className="quest-link" onClick={() => onQuestClick(q)} title="Click for details">
                  {q.name}
                </button>
                {active.has(q.id) && (
                  <span className="active-badge" title="You're currently on this quest">▶ Active</span>
                )}
                {q.series && seriesStats.has(q.series) && (
                  <button
                    className="series-badge"
                    onClick={() => onSeriesClick(q.series!)}
                    title={`${q.series} questline — click to show the whole arc`}
                  >
                    {q.series} {seriesStats.get(q.series)!.done}/{seriesStats.get(q.series)!.total}
                  </button>
                )}
              </td>
              <td>{q.trader}</td>
              <td className="level-col">{q.minLevel}</td>
              <td className="kappa-col">{q.kappa && <span className="kappa-badge">κ</span>}</td>
              <td className="lk-col"><LightkeeperMark quest={q} /></td>
              <td>
                <div className="badge-group">
                  {q.categories.map((c) => (
                    <span key={c} className={`badge cat-${c.replace(/[^a-zA-Z]/g, '')}`}>
                      {c}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <div className="badge-group">
                  {q.maps.map((m) => {
                    const pseudo = PSEUDO_MAPS[m]
                    return (
                      <span
                        key={m}
                        title={pseudo?.blurb}
                        className={[
                          'badge map-badge',
                          isPseudoMap(m) ? 'pseudo' : '',
                          pseudo?.tone === 'warn' ? 'warn' : '',
                          EVENT_MAPS.has(m) ? 'event' : '',
                        ].join(' ')}
                      >
                        {m}
                      </span>
                    )
                  })}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
  )
}
