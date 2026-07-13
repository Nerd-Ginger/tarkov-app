import { useMemo, useState } from 'react'
import type { Ammo } from '../types'

type SortField = 'name' | 'caliber' | 'damage' | 'pen' | 'armorDamage' | 'fragChance' | 'velocity'
type SortDir = 'asc' | 'desc'

interface Props {
  ammo: Ammo[]
}

const COLUMNS: { field: SortField; label: string; title?: string }[] = [
  { field: 'name', label: 'Round' },
  { field: 'caliber', label: 'Caliber' },
  { field: 'damage', label: 'Dmg', title: 'Flesh damage (per pellet for shot)' },
  { field: 'pen', label: 'Pen', title: 'Penetration power' },
  { field: 'armorDamage', label: 'Armor dmg', title: 'Armor damage %' },
  { field: 'fragChance', label: 'Frag', title: 'Fragmentation chance' },
  { field: 'velocity', label: 'm/s', title: 'Muzzle velocity' },
]

/** Pen-power tiers, roughly matching the community color coding for armor classes. */
function penTier(pen: number): string {
  if (pen >= 50) return 'pen-6'
  if (pen >= 40) return 'pen-5'
  if (pen >= 30) return 'pen-4'
  if (pen >= 20) return 'pen-3'
  if (pen >= 10) return 'pen-2'
  return 'pen-1'
}

const ARMOR_CLASSES = [1, 2, 3, 4, 5, 6] as const

/**
 * Heuristic 1–5 effectiveness vs an armor class, from pen power against the
 * class's protection value (class × 10). 5 ≈ penetrates almost every shot,
 * 3 ≈ works but chews durability first, 1 ≈ don't bother.
 */
function armorRating(pen: number, armorClass: number): number {
  const r = pen / (armorClass * 10)
  if (r >= 1.3) return 5
  if (r >= 1.1) return 4
  if (r >= 0.9) return 3
  if (r >= 0.7) return 2
  return 1
}

export function AmmoView({ ammo }: Props) {
  const [calibers, setCalibers] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const allCalibers = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of ammo) counts.set(a.caliber, (counts.get(a.caliber) ?? 0) + 1)
    return [...counts.keys()].sort((a, b) => a.localeCompare(b))
  }, [ammo])

  const toggleCaliber = (c: string) => {
    setCalibers((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  const handleSort = (field: SortField) => {
    const numeric = field !== 'name' && field !== 'caliber'
    if (sortField === field) {
      const first: SortDir = numeric ? 'desc' : 'asc'
      const second: SortDir = numeric ? 'asc' : 'desc'
      if (sortDir === first) setSortDir(second)
      else {
        setSortField(null)
      }
    } else {
      setSortField(field)
      setSortDir(numeric ? 'desc' : 'asc')
    }
  }

  const rows = useMemo(() => {
    let list = ammo
    if (calibers.size > 0) list = list.filter((a) => calibers.has(a.caliber))
    if (search) {
      const s = search.toLowerCase()
      list = list.filter((a) => a.name.toLowerCase().includes(s) || a.caliber.toLowerCase().includes(s))
    }
    if (sortField) {
      const m = sortDir === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        if (sortField === 'name') return m * a.name.localeCompare(b.name)
        if (sortField === 'caliber') return m * a.caliber.localeCompare(b.caliber) || b.pen - a.pen
        return m * (a[sortField] - b[sortField]) || a.name.localeCompare(b.name)
      })
    }
    return list
  }, [ammo, calibers, search, sortField, sortDir])

  const arrow = (f: SortField) => (sortField === f ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <div className="ammo-view">
      <div className="filter-bar">
        <div className="filter-row">
          <span className="filter-label">Caliber</span>
          <div className="chip-group">
            {allCalibers.map((c) => (
              <button key={c} className={`chip ${calibers.has(c) ? 'active' : ''}`} onClick={() => toggleCaliber(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-row controls">
          <input
            type="search"
            placeholder="Search rounds…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(calibers.size > 0 || search) && (
            <button
              className="clear-btn"
              onClick={() => {
                setCalibers(new Set())
                setSearch('')
              }}
            >
              Clear
            </button>
          )}
          <span className="flow-hint">pen color = rough armor-class tier</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="ammo-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.field}
                  title={c.title}
                  className={`sortable ${sortField === c.field ? 'sorted' : ''} ${
                    c.field !== 'name' && c.field !== 'caliber' ? 'num-col' : ''
                  }`}
                  onClick={() => handleSort(c.field)}
                >
                  {c.label}
                  {arrow(c.field)}
                </th>
              ))}
              {ARMOR_CLASSES.map((ac) => (
                <th
                  key={ac}
                  className="rate-col"
                  title={`Effectiveness vs class ${ac} armor — 5 penetrates nearly every shot, 1 won't get through`}
                >
                  C{ac}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="ammo-name">
                  {a.name}
                  {a.tracer && <span className="tracer-tag" title="Tracer round">T</span>}
                </td>
                <td className="ammo-caliber">{a.caliber}</td>
                <td className="num-col">{a.damage}</td>
                <td className={`num-col pen ${penTier(a.pen)}`}>{a.pen}</td>
                <td className="num-col">{a.armorDamage}%</td>
                <td className="num-col">{Math.round(a.fragChance * 100)}%</td>
                <td className="num-col">{a.velocity || '–'}</td>
                {ARMOR_CLASSES.map((ac) => {
                  const r = armorRating(a.pen, ac)
                  return (
                    <td key={ac} className={`rate-col rate-${r}`} title={`vs class ${ac}: ${r}/5`}>
                      {r}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="empty-note">No rounds match.</p>}
    </div>
  )
}
