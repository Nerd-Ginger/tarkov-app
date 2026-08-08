import { useCallback, useEffect, useRef, useState } from 'react'
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
  selectedId: string | null
  onMarkerClick: (id: string) => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 12

export function MapCanvas({ art, markers, showLabels, selectedId, onMarkerClick }: Props) {
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

  // Markers keep a constant on-screen size as you zoom, so a dense area
  // separates out instead of the dots growing with it.
  const r = 6 / zoom
  const stroke = 1.5 / zoom

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
                fontSize={11 / zoom}
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
                className={`map-zone tone-${m.tone.replace(/[^a-zA-Z]/g, '')} ${m.dimmed ? 'dim' : ''} ${m.finished ? 'finished' : ''} ${selectedId === m.id ? 'sel' : ''}`}
                points={m.outline.map((p) => `${p.x},${p.z}`).join(' ')}
                strokeWidth={stroke}
                onClick={() => onMarkerClick(m.id)}
              >
                <title>{m.label}</title>
              </polygon>
            ) : null,
          )}

          {markers.map((m) => (
            <circle
              key={m.id}
              className={`map-marker tone-${m.tone.replace(/[^a-zA-Z]/g, '')} ${m.dimmed ? 'dim' : ''} ${m.finished ? 'finished' : ''} ${selectedId === m.id ? 'sel' : ''}`}
              cx={m.x}
              cy={m.z}
              r={selectedId === m.id ? r * 1.5 : r}
              strokeWidth={stroke}
              onClick={() => onMarkerClick(m.id)}
            >
              <title>{m.label}</title>
            </circle>
          ))}
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
