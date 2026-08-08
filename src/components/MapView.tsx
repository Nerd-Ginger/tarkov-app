import { useEffect, useMemo, useState } from 'react'
import type { Quest } from '../types'
import type { MapIdentity } from '../data/normalize'
import { mapSortKey } from '../data/normalize'
import { MAP_ART } from '../data/mapArt'
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
}

export function MapView({ quests, mapIds, progress, done, active, hideDone, onQuestClick }: Props) {
  const [selectedMap, setSelectedMap] = useState<string | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
    const out = new Map<string, Placed[]>()
    for (const [name, { ids }] of idsByName) {
      const placed: Placed[] = []
      for (const q of quests) {
        for (const o of q.objectives) {
          if (o.optional) continue
          const complete = objectiveComplete(o, progress, done.has(q.id))
          if (complete && hideDone) continue
          for (const [i, loc] of o.locations.entries()) {
            if (!ids.has(loc.mapId)) continue
            placed.push({
              quest: q,
              objectiveDescription: o.description,
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
      if (placed.length > 0) out.set(name, placed)
    }
    return out
  }, [quests, idsByName, progress, done, active])

  const mapNames = useMemo(
    () => [...byMap.keys()].sort((a, b) => mapSortKey(a) - mapSortKey(b)),
    [byMap],
  )

  // Keep the selection valid as filters change the available maps.
  useEffect(() => {
    if (mapNames.length === 0) return
    if (!selectedMap || !mapNames.includes(selectedMap)) setSelectedMap(mapNames[0])
  }, [mapNames, selectedMap])

  const placed = (selectedMap && byMap.get(selectedMap)) || []
  const slug = (selectedMap && idsByName.get(selectedMap)?.slug) || ''
  const art = MAP_ART[slug]

  const selected = placed.find((p) => p.marker.id === selectedId)

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
                setSelectedId(null)
              }}
            >
              {m} <span className="chip-count">{byMap.get(m)?.length ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row controls">
        <label className="check-label" title="Show the map's named landmarks.">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          Landmarks
        </label>
        <span className="legend map-legend-note">
          {placed.length} location{placed.length === 1 ? '' : 's'} on {selectedMap}
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
            selectedId={selectedId}
            onMarkerClick={setSelectedId}
          />
          {selected && (
            <div className="map-selection">
              <button className="quest-link" onClick={() => onQuestClick(selected.quest)}>
                {selected.quest.name}
              </button>
              <span className="map-selection-obj">{selected.objectiveDescription}</span>
              <span className="map-selection-meta">
                {selected.quest.trader} · Lv {selected.quest.minLevel}+
              </span>
            </div>
          )}
        </>
      )}

      <p className="legend">
        Locations come from tarkov.dev's quest data; map artwork is loaded from their asset host, so
        this view needs a connection even though the rest of the app doesn't. Roughly half of all
        objectives have no position in the data at all.
      </p>
    </div>
  )
}
