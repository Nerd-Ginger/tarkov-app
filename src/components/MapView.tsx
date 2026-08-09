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
  /** Which objective this position belongs to; one objective can have several. */
  objectiveId: string
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
      /**
       * Guards against the same objective appearing twice on one map.
       *
       * Aliased variants are separate map ids that we fold into one display
       * name — Ground Zero and Ground Zero 21+, Factory and Night Factory — and
       * the API repeats an objective's zone under each. Needle in a Haystack
       * carries the same courtyard zone at (-15.4, 68.9) on both Ground Zero
       * ids, which listed it twice at one spot.
       */
      const seen = new Set<string>()
      const anywhereSeen = new Set<string>()
      for (const q of quests) {
        for (const o of q.objectives) {
          if (o.optional) continue
          const complete = objectiveComplete(o, progress, done.has(q.id))
          if (complete && hideDone) continue
          for (const [i, loc] of o.locations.entries()) {
            if (!ids.has(loc.mapId)) continue
            const at = `${o.id}:${Math.round(loc.x)}:${Math.round(loc.z)}`
            if (seen.has(at)) continue
            seen.add(at)
            // A zone covering most of the map means "anywhere on this map" —
            // kill 15 Scavs on Factory. As a rectangle it says nothing, and a
            // dot at its centre is worse: it implies a spot to stand. These are
            // listed separately so the map stays about actual places.
            if (art && spansMap(loc, art)) {
              // one row per objective, not per zone: Claustrophobia carries four
              // overlapping map-wide kill zones for a single objective
              if (!anywhereSeen.has(o.id)) {
                anywhereSeen.add(o.id)
                anywhere.push({ quest: q, objectiveDescription: o.description })
              }
              continue
            }
            placed.push({
              quest: q,
              objectiveId: o.id,
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
      { name: 'Ground', group: art.baseGroup, tiles: art.tiles, count: ground.length },
      ...alt.map((f) => ({ name: f.name, group: f.group as string | null, tiles: f.tiles, count: f.on.length })),
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

  /**
   * Spots worth building a raid around, ranked by how many DISTINCT quests they
   * serve.
   *
   * Ranked on quests rather than objectives on purpose: five spawn points for
   * one quest item is one errand, while three objectives from three different
   * quests in one room is the thing worth walking to. Grouped in world units
   * rather than screen pixels so the ranking doesn't reshuffle as you zoom.
   */
  const hotspots = useMemo(() => {
    const RADIUS = 30
    const taken = new Set<number>()
    const out: { quests: string[]; entries: Placed[]; x: number; z: number; near: string | null }[] = []
    for (let i = 0; i < placed.length; i++) {
      if (taken.has(i)) continue
      taken.add(i)
      const group = [placed[i]]
      for (let j = i + 1; j < placed.length; j++) {
        if (taken.has(j)) continue
        const dx = placed[i].marker.x - placed[j].marker.x
        const dz = placed[i].marker.z - placed[j].marker.z
        if (dx * dx + dz * dz <= RADIUS * RADIUS) {
          taken.add(j)
          group.push(placed[j])
        }
      }
      const quests = [...new Set(group.map((g) => g.quest.name))]
      if (quests.length < 2) continue
      const x = group.reduce((s, g) => s + g.marker.x, 0) / group.length
      const z = group.reduce((s, g) => s + g.marker.z, 0) / group.length
      // name the spot after whichever landmark is closest, if any is close enough
      let near: string | null = null
      let best = Infinity
      for (const l of art?.labels ?? []) {
        const d = (l.x - x) ** 2 + (l.z - z) ** 2
        if (d < best) {
          best = d
          near = l.text
        }
      }
      out.push({ quests, entries: group, x, z, near: best <= 120 * 120 ? near : null })
    }
    return out.sort((a, b) => b.quests.length - a.quests.length).slice(0, 8)
  }, [placed, art])

  /**
   * What the readout lists for the current selection, one row per objective.
   *
   * A cluster can hold several positions of the SAME objective — quest items
   * list every possible spawn, so Luxurious Life's wine bottle has five spots
   * in one store. Those are five real markers but one errand, so they collapse
   * to a single row with a count.
   */
  const selected = useMemo(() => {
    const byObjective = new Map<string, { row: Placed; spots: number }>()
    for (const p of placed) {
      if (!selectedIds.includes(p.marker.id)) continue
      const hit = byObjective.get(p.objectiveId)
      if (hit) hit.spots++
      else byObjective.set(p.objectiveId, { row: p, spots: 1 })
    }
    return [...byObjective.values()]
  }, [placed, selectedIds])

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
      ) : !art.svg && !art.tiles ? (
        <p className="empty-note">
          No background artwork is published for {selectedMap}. Its {placed.length} quest location
          {placed.length === 1 ? '' : 's'} still show in the quest list.
        </p>
      ) : (
        <>
          <MapCanvas
            art={art}
            /* Artwork only while alignment is being sorted out: no quest markers,
               no zone polygons, no landmark labels. Floors stay, so each level can
               be checked on its own. Pass the markers back in to restore it. */
            markers={[]}
            showLabels={false}
            activeGroup={activeFloor?.group ?? null}
            activeTiles={activeFloor?.tiles ?? null}
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
                {selected.map(({ row, spots }) => (
                  <li key={row.objectiveId}>
                    <button className="quest-link" onClick={() => onQuestClick(row.quest)}>
                      {row.quest.name}
                    </button>
                    <span className="map-selection-obj">{row.objectiveDescription}</span>
                    {spots > 1 && (
                      <span className="map-selection-meta" title="This item can spawn in several places here">
                        {spots} spots
                      </span>
                    )}
                    <span className="map-selection-meta">
                      {row.quest.trader} · Lv {row.quest.minLevel}+
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {hotspots.length > 0 && (
        <div className="map-hotspots">
          <span className="map-selection-count">
            Best stops on {selectedMap}
            {floors.length > 1 && activeFloor ? ` · ${activeFloor.name}` : ''}
          </span>
          <ol className="hotspot-list">
            {hotspots.map((h) => (
              <li key={`${h.x}-${h.z}`}>
                <button
                  className="hotspot-btn"
                  onClick={() => setSelectedIds(h.entries.map((e) => e.marker.id))}
                  title="Highlight these on the map"
                >
                  <span className="hotspot-count">{h.quests.length}</span>
                  <span className="hotspot-where">{h.near ?? 'this spot'}</span>
                </button>
                <span className="hotspot-quests">{h.quests.join(' · ')}</span>
              </li>
            ))}
          </ol>
        </div>
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
