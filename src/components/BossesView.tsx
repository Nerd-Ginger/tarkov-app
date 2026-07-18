import { useEffect, useState } from 'react'
import type { BossEscort, Intel, MapBosses } from '../types'
import { ago } from '../data/timeFormat'
import { useExpandedGroups } from '../hooks/useExpandedGroups'

interface Props {
  intel: Intel
  fetchedAt: number | null
  loading: boolean
  offline: boolean
  onRefresh: () => void
}

const GOON_MAPS = new Set(['Customs', 'Woods', 'Lighthouse', 'Shoreline'])

/** "4 Reshala Guard", "0–2 more" for a same-name escort (rogue PMC squads). */
function escortLabel(bossName: string, e: BossEscort): string {
  const count = e.min === e.max ? `${e.max}` : `${e.min}–${e.max}`
  return e.name === bossName ? `${count} more` : `${count} ${e.name}`
}

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
  const { expanded, toggle, expandAll, collapseAll } = useExpandedGroups('bosses')

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
          <button className="clear-btn" onClick={() => expandAll(bossSpawns.map((m) => m.map))}>
            Expand all
          </button>
          <button className="clear-btn" onClick={collapseAll}>
            Collapse all
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
      <p className="legend">
        Guard counts are per boss. A range means the squad size varies raid to raid.
      </p>
      <div className="table-wrap">
        <table className="bosses-table">
          <thead>
            <tr>
              <th>Boss (spawn %)</th>
              <th>Guards</th>
            </tr>
          </thead>
          <tbody>
            {bossSpawns.map((m) => (
              <MapBossGroup key={m.map} entry={m} open={expanded.has(m.map)} onToggle={() => toggle(m.map)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MapBossGroup({ entry, open, onToggle }: { entry: MapBosses; open: boolean; onToggle: () => void }) {
  const { map, bosses } = entry
  return (
    <>
      <tr className="caliber-row" onClick={onToggle}>
        <td colSpan={2}>
          <span className={`collapse-arrow ${open ? 'open' : ''}`}>&#9654;</span>
          {map}
          <span className="caliber-count">
            {bosses.length} boss{bosses.length === 1 ? '' : 'es'}
          </span>
        </td>
      </tr>
      {open &&
        bosses.map((b, i) => (
          <tr key={`${b.name}-${i}`}>
            <td>
              <span className={`badge boss-badge ${chanceClass(b.chance)}`}>
                {b.name} {Math.round(b.chance * 100)}%
              </span>
            </td>
            <td>
              {b.escorts.length === 0 ? (
                <span className="escort-none">solo</span>
              ) : (
                <div className="badge-group">
                  {b.escorts.map((e) => (
                    <span key={e.name} className="badge escort-badge">
                      {escortLabel(b.name, e)}
                    </span>
                  ))}
                </div>
              )}
            </td>
          </tr>
        ))}
    </>
  )
}
