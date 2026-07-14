import { useEffect, useState } from 'react'
import type { Intel } from '../types'
import { ago } from '../data/timeFormat'

interface Props {
  intel: Intel
  fetchedAt: number | null
  loading: boolean
  offline: boolean
  onRefresh: () => void
}

const GOON_MAPS = new Set(['Customs', 'Woods', 'Lighthouse', 'Shoreline'])

function chanceClass(chance: number): string {
  if (chance >= 0.66) return 'chance-high'
  if (chance >= 0.33) return 'chance-mid'
  return 'chance-low'
}

export function BossesView({ intel, fetchedAt, loading, offline, onRefresh }: Props) {
  // tick every 30s so "last seen" stays fresh
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const { bossSpawns, goonReports } = intel

  if (bossSpawns.length === 0 && goonReports.length === 0) {
    return (
      <p className="empty-note">
        {loading ? 'Fetching intel…' : offline ? "Couldn't reach tarkov.dev. " : 'No intel loaded. '}
        {!loading && (
          <button className="clear-btn" onClick={onRefresh}>
            Fetch intel
          </button>
        )}
      </p>
    )
  }

  // latest goon sighting per map
  const goonLatest = new Map<string, number>()
  for (const g of goonReports) {
    if (!goonLatest.has(g.map)) goonLatest.set(g.map, g.seenAt)
  }
  const goonRows = [...GOON_MAPS].map((map) => ({ map, seenAt: goonLatest.get(map) ?? null }))

  return (
    <div className="bosses-view">
      <div className="filter-bar">
        <div className="filter-row controls">
          <button className="clear-btn" onClick={onRefresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh intel'}
          </button>
          <span className="flow-hint">
            {fetchedAt && <>intel updated {ago(fetchedAt)}</>}
            {offline && <em className="offline"> · offline, cached</em>}
          </span>
        </div>
      </div>

      <h3 className="best-group-title">Goon squad — last seen</h3>
      <p className="legend">
        Community-reported sightings of the Goons (Knight, Big Pipe, Birdeye). They roam these maps.
      </p>
      <div className="goon-grid">
        {goonRows.map(({ map, seenAt }) => (
          <div key={map} className={`goon-card ${seenAt && Date.now() - seenAt < 3_600_000 ? 'hot' : ''}`}>
            <span className="goon-map">{map}</span>
            <span className="goon-seen">{seenAt ? ago(seenAt) : 'no reports'}</span>
          </div>
        ))}
      </div>

      <h3 className="best-group-title">Boss spawn chances</h3>
      <div className="table-wrap">
        <table className="bosses-table">
          <thead>
            <tr>
              <th>Map</th>
              <th>Bosses (spawn %)</th>
            </tr>
          </thead>
          <tbody>
            {bossSpawns.map((m) => (
              <tr key={m.map}>
                <td className="map-name">{m.map}</td>
                <td>
                  <div className="badge-group">
                    {m.bosses.map((b) => (
                      <span key={b.name} className={`badge boss-badge ${chanceClass(b.chance)}`}>
                        {b.name} {Math.round(b.chance * 100)}%
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
