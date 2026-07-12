import { useMemo, useState } from 'react'
import type { StationLevel } from '../types'
import type { Inventory } from '../hooks/useInventory'
import { FlowChart } from './FlowChart'
import type { FlowEdge, FlowNodeInput } from './FlowChart'
import { stationLevelKey } from '../data/normalize'

const fmt = (n: number) => n.toLocaleString('en-US')

function stationLevelColor(level: number): string {
  if (level <= 1) return 'var(--cat-extract)'
  if (level === 2) return 'var(--accent)'
  if (level === 3) return 'var(--cat-plant)'
  return 'var(--cat-kill)'
}

interface Props {
  stations: StationLevel[]
  built: Set<string>
  inventory: Inventory
  onToggleBuilt: (key: string) => void
}

export function HideoutView({ stations, built, inventory, onToggleBuilt }: Props) {
  const [tableOpen, setTableOpen] = useState(true)
  const [chartOpen, setChartOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [hideBuilt, setHideBuilt] = useState(false)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = stations
    if (q) list = list.filter((l) => l.stationName.toLowerCase().includes(q))
    if (hideBuilt) list = list.filter((l) => !built.has(l.key))
    return list
  }, [stations, search, hideBuilt, built])

  const builtCount = stations.filter((l) => built.has(l.key)).length

  const { nodes, edges } = useMemo(() => {
    const nodes: FlowNodeInput[] = stations.map((l) => ({
      id: l.key,
      accentColor: stationLevelColor(l.level),
      done: built.has(l.key),
      sortKey: l.level,
      label: `${l.stationName} ${l.level}`,
      content: (
        <>
          <input
            type="checkbox"
            checked={built.has(l.key)}
            onChange={() => onToggleBuilt(l.key)}
            className="tree-check"
          />
          <span className="flow-node-name" title={`${l.stationName} level ${l.level}`}>
            {l.stationName}
          </span>
          <span className="flow-node-level">Lv {l.level}</span>
        </>
      ),
    }))
    const keys = new Set(stations.map((l) => l.key))
    const edges: FlowEdge[] = []
    for (const l of stations) {
      for (const p of l.stationPrereqs) {
        const from = stationLevelKey(p.stationId, p.level)
        if (keys.has(from)) edges.push({ from, to: l.key })
      }
    }
    return { nodes, edges }
  }, [stations, built, onToggleBuilt])

  if (stations.length === 0) {
    return <p className="empty-note">No hideout data yet — hit Refresh data to fetch it.</p>
  }

  return (
    <div className="hideout-view">
      <section>
        <h2 className="collapsible" onClick={() => setTableOpen(!tableOpen)}>
          <span className={`collapse-arrow ${tableOpen ? 'open' : ''}`}>&#9654;</span>
          Stations <span className="section-count">({builtCount}/{stations.length} built)</span>
        </h2>
        {tableOpen && (
          <>
            <div className="filter-bar hideout-controls">
              <div className="filter-row controls">
                <input
                  type="search"
                  placeholder="Search stations…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <label className="check-label">
                  <input type="checkbox" checked={hideBuilt} onChange={(e) => setHideBuilt(e.target.checked)} />
                  Hide built
                </label>
              </div>
            </div>
            <div className="table-wrap">
              <table className="hideout-table">
                <thead>
                  <tr>
                    <th className="done-col">✓</th>
                    <th>Station</th>
                    <th className="level-col">Lv</th>
                    <th>Items required</th>
                    <th>Other requirements</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const isBuilt = built.has(l.key)
                    return (
                      <tr key={l.key} className={isBuilt ? 'done' : ''}>
                        <td className="done-col">
                          <input
                            type="checkbox"
                            checked={isBuilt}
                            onChange={() => onToggleBuilt(l.key)}
                            aria-label={`Mark ${l.stationName} ${l.level} built`}
                          />
                        </td>
                        <td className="map-name">{l.stationName}</td>
                        <td className="level-col">{l.level}</td>
                        <td>
                          <div className="badge-group">
                            {l.items.length === 0 && <span className="empty-note">none</span>}
                            {l.items.map((r) => {
                              const have = inventory[r.item.id] ?? 0
                              const covered = have >= r.count
                              return (
                                <span
                                  key={r.item.id}
                                  className={`badge item-req ${covered ? 'covered' : ''}`}
                                  title={`${r.item.name} — have ${fmt(have)} / need ${fmt(r.count)}`}
                                >
                                  {r.item.shortName} ×{fmt(r.count)}
                                </span>
                              )
                            })}
                          </div>
                        </td>
                        <td>
                          <div className="badge-group">
                            {l.stationPrereqs.map((p) => {
                              const met = built.has(stationLevelKey(p.stationId, p.level))
                              return (
                                <span
                                  key={`${p.stationId}:${p.level}`}
                                  className={`badge station-badge ${met ? 'covered' : ''}`}
                                >
                                  {p.stationName} {p.level}
                                </span>
                              )
                            })}
                            {l.traderReqs.map((t) => (
                              <span key={t.trader} className="badge">
                                {t.trader} LL{t.level}
                              </span>
                            ))}
                            {l.skillReqs.map((s) => (
                              <span key={s.name} className="badge">
                                {s.name} {s.level}
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
          </>
        )}
      </section>

      <section>
        <h2 className="collapsible" onClick={() => setChartOpen(!chartOpen)}>
          <span className={`collapse-arrow ${chartOpen ? 'open' : ''}`}>&#9654;</span>
          Build order
        </h2>
        {chartOpen && (
          <FlowChart
            nodes={nodes}
            edges={edges}
            toolbarLeft={
              <span className="flow-progress">
                {builtCount}/{stations.length} built
              </span>
            }
          />
        )}
      </section>
    </div>
  )
}
