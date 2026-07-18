import { useMemo, useState } from 'react'
import type { Quest } from '../types'
import { EVENT_MAPS, PSEUDO_MAPS, isPseudoMap, mapSortKey } from '../data/normalize'
import { isBlocked, matchesNonMap } from '../filters'
import type { Filters } from '../filters'

type MapSortField = 'map' | 'left' | 'total'
type SortDir = 'asc' | 'desc'

interface Props {
  quests: Quest[]
  filters: Filters
  done: Set<string>
  active: Set<string>
  onQuestClick: (quest: Quest) => void
}

export function MapsSection({ quests, filters, done, active, onQuestClick }: Props) {
  const [sortField, setSortField] = useState<MapSortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const rows = useMemo(() => {
    const byMap = new Map<string, Quest[]>()
    for (const q of quests) {
      if (!matchesNonMap(q, filters)) continue
      if (filters.hideBlocked && isBlocked(q, done)) continue
      for (const m of q.maps) {
        if (filters.maps.size > 0 && !filters.maps.has(m)) continue
        let list = byMap.get(m)
        if (!list) byMap.set(m, (list = []))
        list.push(q)
      }
    }
    const entries = [...byMap.entries()]
    if (!sortField) {
      entries.sort((a, b) => mapSortKey(a[0]) - mapSortKey(b[0]))
    } else {
      const m = sortDir === 'asc' ? 1 : -1
      entries.sort((a, b) => {
        switch (sortField) {
          case 'map':
            return m * a[0].localeCompare(b[0])
          case 'left': {
            const al = a[1].filter((q) => !done.has(q.id)).length
            const bl = b[1].filter((q) => !done.has(q.id)).length
            return m * (al - bl) || a[0].localeCompare(b[0])
          }
          case 'total':
            return m * (a[1].length - b[1].length) || a[0].localeCompare(b[0])
        }
      })
    }
    return entries
  }, [quests, filters, sortField, sortDir, done])

  const handleSort = (field: MapSortField) => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortField(null); setSortDir('asc') }
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const arrow = (field: MapSortField) => sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  if (rows.length === 0) return <p className="empty-note">No quests match the current filters.</p>

  return (
    <div className="table-wrap">
    <table className="maps-table">
      <thead>
        <tr>
          <th className={`sortable ${sortField === 'map' ? 'sorted' : ''}`} onClick={() => handleSort('map')}>
            Map{arrow('map')}
          </th>
          <th className={`count-col sortable ${sortField === 'left' ? 'sorted' : ''}`} onClick={() => handleSort('left')}>
            Left{arrow('left')}
          </th>
          <th>Quests</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([map, list]) => {
          const remaining = list.filter((q) => !done.has(q.id))
          // active quests first so what you're running is easy to spot per map
          const shown = (filters.hideDone ? remaining : list)
            .slice()
            .sort((a, b) => Number(active.has(b.id)) - Number(active.has(a.id)))
          const pseudo = PSEUDO_MAPS[map]
          return (
            <tr
              key={map}
              className={[isPseudoMap(map) ? 'pseudo-row' : '', pseudo?.tone === 'warn' ? 'warn' : ''].join(' ')}
            >
              <td className="map-name" title={pseudo?.blurb}>
                {map}
                {pseudo && <span className="pseudo-hint">?</span>}
                {EVENT_MAPS.has(map) && <span className="event-tag">event</span>}
              </td>
              <td className="count-col">
                <span className={remaining.length === 0 ? 'count all-done' : 'count'}>
                  {remaining.length}/{list.length}
                </span>
              </td>
              <td>
                <div className="quest-chips">
                  {shown.map((q) => (
                    <button
                      key={q.id}
                      className={`quest-chip ${done.has(q.id) ? 'done' : ''} ${active.has(q.id) ? 'active-chip' : ''}`}
                      title={`${q.trader} · Lv ${q.minLevel}${q.kappa ? ' · Kappa' : ''}${active.has(q.id) ? ' · Active' : ''} — click for details`}
                      onClick={() => onQuestClick(q)}
                    >
                      {active.has(q.id) && '▶ '}
                      {q.name}
                    </button>
                  ))}
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
