import { useEffect, useMemo, useState } from 'react'
import type { Quest } from '../types'
import type { MapIdentity } from '../data/normalize'
import { mapSortKey } from '../data/normalize'
import { MAP_ART } from '../data/mapArt'
import type { MapArt, MapFloor } from '../data/mapArt'
import { MapCanvas } from './MapCanvas'
import type { CanvasMarker } from './MapCanvas'
import { objectiveComplete } from '../data/progress'
import type { QuestProgress } from '../hooks/useQuestProgress'

/**
 * Quest locations plotted on the map they happen on.
 *
 * Scope is deliberately narrow — quest objectives only. The API also carries
 * extracts, spawns, loot and hazards for every map, but this view answers one
 * question: "where do I go for the quests I'm working on?"
 *
 * Only about half of all objectives have a position at all (hand-ins, kills and
 * weapon builds genuinely have none), so this complements the quest list rather
 * than replacing it.
 */

interface Props {
  /** Already filtered by the caller — hide blocked, active-only, trader, etc. */
  quests: Quest[]
  mapIds: MapIdentity[]
  progress: QuestProgress
  done: Set<string>
  active: Set<string>
  /**
   * When on, finished objectives drop off the map entirely. When off they stay,
   * greyed out — the toggle has to do something visible here, and "show me
   * everywhere, including what I've cleared" is a reasonable thing to want.
   */
  hideDone: boolean
  onQuestClick: (quest: Quest) => void
}

interface Placed {
  marker: CanvasMarker
  quest: Quest
  objectiveDescription: string
  /** World height, used to decide which floor this belongs to. */
  y: number
}

/** An objective on this map with no meaningful position — "kill 15 Scavs here". */
interface Anywhere {
  quest: Quest
  objectiveDescription: string
}

/**
 * Does this location's zone cover so much of the map that it means "anywhere"?
 *
 * Measured against the live data: only 3% of zones exceed 5% of their map's
 * area, and 12 of those 15 are `shoot` objectives. Factory is the worst case —
 * its Claustrophobia kill zones are 150x80 on a map that is 143x132, i.e. the
 * whole thing.
 */
function spansMap(loc: { outline: { x: number; z: number }[] }, art: MapArt): boolean {
  if (loc.outline.length < 3) return false
  const xs = loc.outline.map((p) => p.x)
  const zs = loc.outline.map((p) => p.z)
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...zs) - Math.min(...zs)
  const mapW = Math.abs(art.bounds[1][0] - art.bounds[0][0])
  const mapH = Math.abs(art.bounds[1][1] - art.bounds[0][1])
  return (w * h) / (mapW * mapH) > 0.05
}

/**
 * Is this objective on the given floor?
 *
 * Both tests matter. Height alone put 82 outdoor Customs objectives on the
 * second floor, because one of its height bands is [5.7, 1000] — that band is
 * only meant to apply inside Dorms and a handful of other buildings, which is
 * what the footprint boxes describe. An extent with no boxes applies map-wide.
 */
function onFloor(p: Placed, floor: MapFloor): boolean {
  return floor.extents.some((e) => {
    if (p.y < e.height[0] || p.y >= e.height[1]) return false
    if (e.boxes.length === 0) return true
    return e.boxes.some(
      ([x1, z1, x2, z2]) =>
        p.marker.x >= Math.min(x1, x2) &&
        p.marker.x <= Math.max(x1, x2) &&
        p.marker.z >= Math.min(z1, z2) &&
        p.marker.z <= Math.max(z1, z2),
    )
  })
}

export function MapView({ quests, mapIds, progress, done, active, hideDone, onQuestClick }: Props) {
  const [selectedMap, setSelectedMap] = useState<string | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  /** Display name → the map ids that roll up into it (Night Factory → Factory). */
  const idsByName = useMemo(() => {
    const m = new Map<string, { ids: Set<string>; slug: string }>()
    for (const id of mapIds) {
      let e = m.get(id.name)
      if (!e) m.set(id.name, (e = { ids: new Set(), slug: id.slug }))
      e.ids.add(id.id)
      if (!e.slug) e.slug = id.slug
    }
    return m
  }, [mapIds])

  /** Every placeable objective, grouped by map display name. */
  const byMap = useMemo(() => {
    const out = new Map<string, { placed: Placed[]; anywhere: Anywhere[] }>()
    for (const [name, { ids, slug }] of idsByName) {
      const art = MAP_ART[slug]
      const placed: Placed[] = []
      const anywhere: Anywhere[] = []
      for (const q of quests) {
        for (const o of q.objectives) {
          if (o.optional) continue
          const complete = objectiveComplete(o, progress, done.has(q.id))
          if (complete && hideDone) continue
          for (const [i, loc] of o.locations.entries()) {
            if (!ids.has(loc.mapId)) continue
            // A zone covering most of the map means "anywhere on this map" —
            // kill 15 Scavs on Factory. As a rectangle it says nothing, and a
            // dot at its centre is worse: it implies a spot to stand. These are
            // listed separately so the map stays about actual places.
            if (art && spansMap(loc, art)) {
              anywhere.push({ quest: q, objectiveDescription: o.description })
              continue
            }
            placed.push({
              quest: q,
              objectiveDescription: o.description,
              y: loc.y,
              marker: {
                id: `${o.id}:${i}`,
                x: loc.x,
                z: loc.z,
                outline: loc.outline,
                label: `${q.name} — ${o.description}${complete ? ' (done)' : ''}`,
                tone: o.category,
                // fade anything you're not working on: finished objectives, and
                // — once you've marked something active — everything else
                dimmed: complete || (active.size > 0 && !active.has(q.id)),
                finished: complete,
              },
            })
          }
        }
      }
      if (placed.length > 0 || anywhere.length > 0) out.set(name, { placed, anywhere })
    }
    return out
  }, [quests, idsByName, progress, done, active, hideDone])

  const mapNames = useMemo(
    () => [...byMap.keys()].sort((a, b) => mapSortKey(a) - mapSortKey(b)),
    [byMap],
  )

  // Keep the selection valid as filters change the available maps.
  useEffect(() => {
    if (mapNames.length === 0) return
    if (!selectedMap || !mapNames.includes(selectedMap)) setSelectedMap(mapNames[0])
  }, [mapNames, selectedMap])

  const entry = (selectedMap && byMap.get(selectedMap)) || { placed: [], anywhere: [] }
  const slug = (selectedMap && idsByName.get(selectedMap)?.slug) || ''
  const art = MAP_ART[slug]

  /**
   * Which floor an objective is on, from its world height.
   *
   * The artwork stacks every level in one file, so showing them all at once is
   * what made Factory unreadable — its basement drew over its ground floor.
   * Floors whose height ranges catch no objectives are dropped from the picker,
   * so you only see storeys you actually need.
   */
  const floors = useMemo(() => {
    if (!art) return []
    const alt = art.floors
      .map((f) => ({ ...f, on: entry.placed.filter((p) => onFloor(p, f)) }))
      .filter((f) => f.on.length > 0)
    if (alt.length === 0) return []
    const claimed = new Set(alt.flatMap((f) => f.on.map((p) => p.marker.id)))
    const ground = entry.placed.filter((p) => !claimed.has(p.marker.id))
    return [
      { name: 'Ground', group: art.baseGroup, count: ground.length },
      ...alt.map((f) => ({ name: f.name, group: f.group as string | null, count: f.on.length })),
    ].filter((f) => f.count > 0)
  }, [art, entry.placed])

  const [floorName, setFloorName] = useState<string | null>(null)
  useEffect(() => {
    setFloorName(null)
  }, [selectedMap])
  const activeFloor = floors.find((f) => f.name === floorName) ?? floors[0] ?? null

  /** Only the markers on the floor being shown — otherwise they'd float over the wrong storey. */
  const placed = useMemo(() => {
    if (!art || floors.length === 0 || !activeFloor) return entry.placed
    const def = art.floors.find((f) => f.name === activeFloor.name)
    // the Ground pseudo-floor is everything no alternate floor claims
    if (!def) {
      const claimed = new Set(
        art.floors.flatMap((f) => entry.placed.filter((p) => onFloor(p, f)).map((p) => p.marker.id)),
      )
      return entry.placed.filter((p) => !claimed.has(p.marker.id))
    }
    return entry.placed.filter((p) => onFloor(p, def))
  }, [entry.placed, art, floors, activeFloor])

  const selected = placed.filter((p) => selectedIds.includes(p.marker.id))

  if (mapNames.length === 0) {
    return (
      <p className="empty-note">
        No quest locations match the current filters. Note that only about half of all objectives
        have a position in the data — hand-ins, kills and weapon builds have none.
      </p>
    )
  }

  return (
    <div className="map-view">
      <div className="filter-row">
        <span className="filter-label">Map</span>
        <div className="chip-group">
          {mapNames.map((m) => (
            <button
              key={m}
              className={`chip ${selectedMap === m ? 'active' : ''}`}
              onClick={() => {
                setSelectedMap(m)
                setSelectedIds([])
              }}
            >
              {m} <span className="chip-count">{(byMap.get(m)?.placed.length ?? 0) + (byMap.get(m)?.anywhere.length ?? 0)}</span>
            </button>
          ))}
        </div>
      </div>

      {floors.length > 1 && (
        <div className="filter-row">
          <span className="filter-label">Floor</span>
          <div className="chip-group">
            {floors.map((f) => (
              <button
                key={f.name}
                className={`chip ${activeFloor?.name === f.name ? 'active' : ''}`}
                onClick={() => {
                  setFloorName(f.name)
                  setSelectedIds([])
                }}
              >
                {f.name} <span className="chip-count">{f.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="filter-row controls">
        <label className="check-label" title="Show the map's named landmarks.">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          Landmarks
        </label>
        <span className="legend map-legend-note">
          {placed.length} location{placed.length === 1 ? '' : 's'}
          {floors.length > 1 && activeFloor ? ` on ${selectedMap} · ${activeFloor.name}` : ` on ${selectedMap}`}
          {active.size > 0 && ' · active quests highlighted'}
        </span>
      </div>

      {!art ? (
        <p className="empty-note">
          No map artwork is bundled for {selectedMap}. Its {placed.length} quest location
          {placed.length === 1 ? ' is' : 's are'} in the data, but there's nothing to draw them on.
        </p>
      ) : !art.svg ? (
        <p className="empty-note">
          tarkov.dev publishes {selectedMap} only as map tiles, not as an SVG, so there's no
          background to draw. Its {placed.length} quest location
          {placed.length === 1 ? '' : 's'} still show in the quest list.
        </p>
      ) : (
        <>
          <MapCanvas
            art={art}
            markers={placed.map((p) => p.marker)}
            showLabels={showLabels}
            activeGroup={activeFloor?.group ?? null}
            selectedIds={selectedIds}
            onMarkerClick={setSelectedIds}
          />
          {selected.length > 0 && (
            <div className="map-selection">
              {selected.length > 1 && (
                <span className="map-selection-count">
                  {selected.length} objectives at this spot
                </span>
              )}
              <ul className="map-selection-list">
                {selected.map((s) => (
                  <li key={s.marker.id}>
                    <button className="quest-link" onClick={() => onQuestClick(s.quest)}>
                      {s.quest.name}
                    </button>
                    <span className="map-selection-obj">{s.objectiveDescription}</span>
                    <span className="map-selection-meta">
                      {s.quest.trader} · Lv {s.quest.minLevel}+
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {entry.anywhere.length > 0 && (
        <div className="map-anywhere">
          <span className="map-selection-count">
            {entry.anywhere.length} more on {selectedMap} with no fixed spot
          </span>
          <ul className="map-selection-list">
            {entry.anywhere.map((a, i) => (
              <li key={`${a.quest.id}-${i}`}>
                <button className="quest-link" onClick={() => onQuestClick(a.quest)}>
                  {a.quest.name}
                </button>
                <span className="map-selection-obj">{a.objectiveDescription}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="legend">
        Locations come from tarkov.dev's quest data; map artwork is loaded from their asset host, so
        this view needs a connection even though the rest of the app doesn't. Roughly half of all
        objectives have no position in the data at all.
      </p>
    </div>
  )
}
