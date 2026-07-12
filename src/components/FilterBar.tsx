import { CATEGORIES } from '../types'
import type { ObjectiveCategory } from '../types'
import { EVENT_MAPS, isPseudoMap } from '../data/normalize'
import type { Filters } from '../filters'

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  allMaps: string[]
  allTraders: string[]
}

export function FilterBar({ filters, onChange, allMaps, allTraders }: Props) {
  const toggleMap = (name: string) => {
    const maps = new Set(filters.maps)
    if (maps.has(name)) maps.delete(name)
    else maps.add(name)
    onChange({ ...filters, maps })
  }

  const toggleCat = (cat: ObjectiveCategory) => {
    const cats = new Set(filters.cats)
    if (cats.has(cat)) cats.delete(cat)
    else cats.add(cat)
    onChange({ ...filters, cats })
  }

  const anyActive =
    filters.maps.size > 0 ||
    filters.cats.size > 0 ||
    filters.trader !== '' ||
    filters.kappaOnly ||
    filters.hideDone ||
    filters.hideBlocked ||
    filters.showArena ||
    filters.level !== '' ||
    filters.search !== ''

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <span className="filter-label">Maps</span>
        <div className="chip-group">
          {allMaps.map((m) => (
            <button
              key={m}
              className={[
                'chip',
                filters.maps.has(m) ? 'active' : '',
                isPseudoMap(m) ? 'pseudo' : '',
                EVENT_MAPS.has(m) ? 'event' : '',
              ].join(' ')}
              onClick={() => toggleMap(m)}
            >
              {m}
              {EVENT_MAPS.has(m) && <span className="event-tag">event</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row">
        <span className="filter-label">Objectives</span>
        <div className="chip-group">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={`chip cat-${c.replace(/[^a-zA-Z]/g, '')} ${filters.cats.has(c) ? 'active' : ''}`}
              onClick={() => toggleCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row controls">
        <input
          type="search"
          placeholder="Search quests…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
        <select
          value={filters.trader}
          onChange={(e) => onChange({ ...filters, trader: e.target.value })}
        >
          <option value="">All traders</option>
          {allTraders.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="num-label">
          PMC level
          <input
            type="number"
            min={1}
            max={79}
            placeholder="any"
            value={filters.level}
            onChange={(e) => onChange({ ...filters, level: e.target.value })}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={filters.kappaOnly}
            onChange={(e) => onChange({ ...filters, kappaOnly: e.target.checked })}
          />
          Kappa only
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={filters.hideDone}
            onChange={(e) => onChange({ ...filters, hideDone: e.target.checked })}
          />
          Hide done
        </label>
        <label className="check-label" title="Hide quests still locked behind a prerequisite you haven't completed.">
          <input
            type="checkbox"
            checked={filters.hideBlocked}
            onChange={(e) => onChange({ ...filters, hideBlocked: e.target.checked })}
          />
          Hide blocked
        </label>
        <label className="check-label arena-toggle" title="Off by default. Flip on to reveal the Arena questline (Ref) — these require playing Arena (PvP).">
          <input
            type="checkbox"
            checked={filters.showArena}
            onChange={(e) => onChange({ ...filters, showArena: e.target.checked })}
          />
          Arena (PvP)
        </label>
        {anyActive && (
          <button
            className="clear-btn"
            onClick={() =>
              onChange({
                maps: new Set(),
                cats: new Set(),
                trader: '',
                kappaOnly: false,
                hideDone: false,
                hideBlocked: false,
                showArena: false,
                level: '',
                search: '',
              })
            }
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
