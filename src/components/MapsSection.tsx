import { useMemo } from 'react'
import type { Quest } from '../types'
import { EVENT_MAPS, PSEUDO_MAPS, isPseudoMap, mapSortKey } from '../data/normalize'
import { matchesNonMap } from '../filters'
import type { Filters } from '../filters'

interface Props {
  quests: Quest[]
  filters: Filters
  done: Set<string>
  onQuestClick: (id: string) => void
}

export function MapsSection({ quests, filters, done, onQuestClick }: Props) {
  const rows = useMemo(() => {
    const byMap = new Map<string, Quest[]>()
    for (const q of quests) {
      if (!matchesNonMap(q, filters)) continue
      for (const m of q.maps) {
        if (filters.maps.size > 0 && !filters.maps.has(m)) continue
        let list = byMap.get(m)
        if (!list) byMap.set(m, (list = []))
        list.push(q)
      }
    }
    return [...byMap.entries()].sort((a, b) => mapSortKey(a[0]) - mapSortKey(b[0]))
  }, [quests, filters])

  if (rows.length === 0) return <p className="empty-note">No quests match the current filters.</p>

  return (
    <table className="maps-table">
      <thead>
        <tr>
          <th>Map</th>
          <th className="count-col">Left</th>
          <th>Quests</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([map, list]) => {
          const remaining = list.filter((q) => !done.has(q.id))
          const shown = filters.hideDone ? remaining : list
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
                      className={`quest-chip ${done.has(q.id) ? 'done' : ''}`}
                      title={`${q.trader} · Lv ${q.minLevel}${q.kappa ? ' · Kappa' : ''}`}
                      onClick={() => onQuestClick(q.id)}
                    >
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
  )
}
