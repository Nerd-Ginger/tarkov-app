import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MapArt } from '../data/mapArt'

/**
 * A pan/zoom SVG viewport for one map's artwork, with markers plotted in raw
 * game-world coordinates.
 *
 * Hand-rolled rather than Leaflet on purpose: the app has no runtime
 * dependencies beyond React, and the usage is desktop and portrait monitors, so
 * pinch-zoom — the main thing Leaflet would buy — doesn't apply. What's left is
 * drag-to-pan and wheel zoom, which are a few dozen lines.
 *
 * The alignment guarantee: the background image and every marker live in the
 * SAME rotated group, in the same coordinate space. Rotation therefore cannot
 * pull them apart — it only decides which way the map faces. Getting `rotation`
 * wrong turns the map upside down; it never puts a marker in the wrong place.
 *
 * Deliberately knows nothing about quests. It takes shapes with coordinates and
 * reports clicks by id.
 */

export interface CanvasMarker {
  id: string
  x: number
  z: number
  /** Zone polygon in the same world space; empty renders as a point. */
  outline: { x: number; z: number }[]
  label: string
  /** Drives the marker colour class, e.g. 'Visit' | 'Plant/Mark'. */
  tone: string
  dimmed: boolean
  /** Objective already ticked off — drawn hollow so it reads differently from merely un-highlighted. */
  finished: boolean
}

interface Props {
  art: MapArt
  markers: CanvasMarker[]
  showLabels: boolean
  selectedIds: string[]
  onMarkerClick: (ids: string[]) => void
}

/**
 * Markers within this many screen pixels collapse into one.
 *
 * Not cosmetic crowding — objectives genuinely share positions. Lighthouse has
 * 19 in a single 5-unit cell, and Customs 12, because a quest item's possible
 * spawns cluster in one room and several quests reuse the same zone. Measured
 * at default zoom, 66-98% of markers overlapped another, and zooming only took
 * that from 80% to 55%, so zoom alone can't fix it.
 *
 * Grouping in SCREEN space rather than world space means clusters split apart
 * as you zoom in — the separation you get is the separation you can click.
 */
const CLUSTER_PX = 16

const MIN_ZOOM = 1
const MAX_ZOOM = 12

export function MapCanvas({ art, markers, showLabels, selectedIds, onMarkerClick }: Props) {
  const [[x0, z0], [x1, z1]] = art.bounds
  const minX = Math.min(x0, x1)
  const minZ = Math.min(z0, z1)
  const width = Math.abs(x1 - x0)
  const height = Math.abs(z1 - z0)
  const cx = minX + width / 2
  const cz = minZ + height / 2

  // A rotated map is drawn into the same box, so a 90/270 turn needs the box to
  // be square or the corners clip. Padding to the longer side is the cheap fix.
  const quarterTurn = Math.abs(art.rotation % 180) === 90
  const boxW = quarterTurn ? Math.max(width, height) : width
  const boxH = quarterTurn ? Math.max(width, height) : height
  const boxX = cx - boxW / 2
  const boxZ = cz - boxH / 2

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, z: 0 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const drag = useRef<{ px: number; pz: number; ox: number; oz: number } | null>(null)

  /**
   * Rendered width in CSS pixels, needed to size markers and labels.
   *
   * Everything inside the SVG is expressed in world units, and world units per
   * pixel differ by 14x across maps — Factory is 143 units wide where Shoreline
   * is 1560. Sizing a marker as a fixed number of world units therefore gives a
   * 43px blob on Factory and a 4px speck on Shoreline. Measuring lets us work
   * back from a target pixel size instead.
   */
  const [renderedPx, setRenderedPx] = useState(0)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setRenderedPx(e.contentRect.width))
    ro.observe(el)
    setRenderedPx(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  // Reset the viewport when switching maps — keeping a Customs pan offset on
  // Streets would drop you somewhere arbitrary.
  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, z: 0 })
  }, [art.svg, art.bounds])

  const viewW = boxW / zoom
  const viewH = boxH / zoom
  const viewX = boxX + (boxW - viewW) / 2 + pan.x
  const viewZ = boxZ + (boxH - viewH) / 2 + pan.z

  const clampPan = useCallback(
    (p: { x: number; z: number }, z: number) => {
      const slackX = (boxW - boxW / z) / 2
      const slackZ = (boxH - boxH / z) / 2
      return {
        x: Math.max(-slackX, Math.min(slackX, p.x)),
        z: Math.max(-slackZ, Math.min(slackZ, p.z)),
      }
    },
    [boxW, boxH],
  )

  // Wheel is bound natively rather than via React's onWheel: React attaches
  // wheel listeners passively, so preventDefault there is ignored and the page
  // scrolls behind the map while you zoom.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((prev) => {
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev * (e.deltaY < 0 ? 1.2 : 1 / 1.2)))
        setPan((p) => clampPan(p, next))
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [clampPan])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { px: e.clientX, pz: e.clientY, ox: pan.x, oz: pan.z }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    const el = svgRef.current
    if (!d || !el) return
    // convert pixel delta into world units at the current zoom
    const rect = el.getBoundingClientRect()
    const perPxX = viewW / rect.width
    const perPxZ = viewH / rect.height
    setPan(clampPan({ x: d.ox - (e.clientX - d.px) * perPxX, z: d.oz - (e.clientY - d.pz) * perPxZ }, zoom))
  }

  const endDrag = () => {
    drag.current = null
  }

  /**
   * World units per CSS pixel at the current zoom. Multiply a pixel size by
   * this to get the world-unit value that renders at that pixel size — on any
   * map, at any zoom. Falls back to 1 before the first measurement.
   */
  const unitsPerPx = renderedPx > 0 ? viewW / renderedPx : 1

  const MARKER_PX = 6
  const SELECTED_PX = 9
  const LABEL_PX = 12

  const r = MARKER_PX * unitsPerPx
  const rSelected = SELECTED_PX * unitsPerPx
  const labelSize = LABEL_PX * unitsPerPx

  /**
   * Collapse markers that would land on top of each other into one dot.
   *
   * A cluster inherits the least-faded state of its members: if any member is
   * something you're actively working on, the cluster shows as live rather than
   * dimmed, so an active objective can't hide inside a pile of finished ones.
   */
  const clusters = useMemo(() => {
    const radius = CLUSTER_PX * unitsPerPx
    const r2 = radius * radius
    // Greedy rather than grid-bucketed: rounding to a grid leaves pairs that sit
    // either side of a cell boundary un-merged, which measured as 40% of Customs
    // markers still overlapping. Walking outward from each seed fixes that.
    // O(n^2) on a few hundred markers is nothing.
    const taken = new Set<number>()
    const groups: CanvasMarker[][] = []
    for (let i = 0; i < markers.length; i++) {
      if (taken.has(i)) continue
      taken.add(i)
      const group = [markers[i]]
      for (let j = i + 1; j < markers.length; j++) {
        if (taken.has(j)) continue
        const dx = markers[i].x - markers[j].x
        const dz = markers[i].z - markers[j].z
        if (dx * dx + dz * dz <= r2) {
          taken.add(j)
          group.push(markers[j])
        }
      }
      groups.push(group)
    }
    return groups.map((group) => {
      const live = group.filter((g) => !g.dimmed)
      const lead = live[0] ?? group[0]
      return {
        ids: group.map((g) => g.id),
        x: group.reduce((s, g) => s + g.x, 0) / group.length,
        z: group.reduce((s, g) => s + g.z, 0) / group.length,
        count: group.length,
        tone: lead.tone,
        dimmed: live.length === 0,
        finished: group.every((g) => g.finished),
        label:
          group.length === 1
            ? lead.label
            : `${group.length} objectives here — ${group
                .slice(0, 4)
                .map((g) => g.label)
                .join(' · ')}${group.length > 4 ? ' …' : ''}`,
      }
    })
  }, [markers, unitsPerPx])

  return (
    <div className="map-canvas-wrap">
      <svg
        ref={svgRef}
        className={`map-canvas ${drag.current ? 'dragging' : ''}`}
        viewBox={`${viewX} ${viewZ} ${viewW} ${viewH}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        role="img"
      >
        <g transform={`rotate(${art.rotation} ${cx} ${cz})`}>
          {art.svg && (
            <image
              href={art.svg}
              x={minX}
              y={minZ}
              width={width}
              height={height}
              preserveAspectRatio="none"
            />
          )}

          {showLabels &&
            art.labels.map((l) => (
              <text
                key={`${l.text}-${l.x}-${l.z}`}
                className="map-label"
                x={l.x}
                y={l.z}
                fontSize={labelSize}
                // counter-rotate so text stays upright whatever the map does
                transform={`rotate(${-art.rotation} ${l.x} ${l.z})`}
              >
                {l.text}
              </text>
            ))}

          {markers.map((m) =>
            m.outline.length > 2 ? (
              <polygon
                key={`${m.id}-zone`}
                className={`map-zone tone-${m.tone.replace(/[^a-zA-Z]/g, '')} ${m.dimmed ? 'dim' : ''} ${m.finished ? 'finished' : ''} ${selectedIds.includes(m.id) ? 'sel' : ''}`}
                points={m.outline.map((p) => `${p.x},${p.z}`).join(' ')}
                vectorEffect="non-scaling-stroke"
                onClick={() => onMarkerClick([m.id])}
              >
                <title>{m.label}</title>
              </polygon>
            ) : null,
          )}

          {clusters.map((c) => {
            const sel = c.ids.some((id) => selectedIds.includes(id))
            return (
              <g key={c.ids[0]} className="map-marker-group" onClick={() => onMarkerClick(c.ids)}>
                <circle
                  className={`map-marker tone-${c.tone.replace(/[^a-zA-Z]/g, '')} ${c.dimmed ? 'dim' : ''} ${c.finished ? 'finished' : ''} ${sel ? 'sel' : ''}`}
                  cx={c.x}
                  cy={c.z}
                  r={sel || c.count > 1 ? rSelected : r}
                  vectorEffect="non-scaling-stroke"
                />
                {c.count > 1 && (
                  <text
                    className="map-marker-count"
                    x={c.x}
                    y={c.z}
                    fontSize={LABEL_PX * 0.8 * unitsPerPx}
                    dy={LABEL_PX * 0.28 * unitsPerPx}
                    transform={`rotate(${-art.rotation} ${c.x} ${c.z})`}
                  >
                    {c.count}
                  </text>
                )}
                <title>{c.label}</title>
              </g>
            )
          })}
        </g>
      </svg>

      <div className="map-zoom-controls">
        <button onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.4))} title="Zoom in">
          +
        </button>
        <button onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.4))} title="Zoom out">
          −
        </button>
        <button
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, z: 0 })
          }}
          title="Reset view"
        >
          ⟲
        </button>
      </div>
    </div>
  )
}
