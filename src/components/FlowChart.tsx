import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export const NODE_W = 190
export const NODE_H = 44
const COL_GAP = 70
const ROW_GAP = 14
const PAD = 30

export interface FlowNodeInput {
  id: string
  /** Rendered inside the node card (checkbox, label, badges…). */
  content: ReactNode
  /** Left-border accent color (CSS value). */
  accentColor: string
  /** Dims the node and dashes edges between done endpoints. */
  done: boolean
  /** Initial row ordering within a column (before barycenter passes). */
  sortKey: number
  /** Tiebreaker for sorting. */
  label: string
}

export interface FlowEdge {
  from: string
  to: string
}

interface LaidOutNode {
  node: FlowNodeInput
  x: number
  y: number
}

interface Layout {
  nodes: LaidOutNode[]
  edges: { from: LaidOutNode; to: LaidOutNode }[]
  width: number
  height: number
}

/**
 * Layered DAG layout: column = longest prerequisite chain from a root, row
 * order via a few barycenter passes so children sit near their parents and
 * edges stay mostly horizontal.
 */
function layoutDag(inputNodes: FlowNodeInput[], inputEdges: FlowEdge[]): Layout {
  const ids = new Set(inputNodes.map((n) => n.id))
  const byId = new Map(inputNodes.map((n) => [n.id, n]))
  const parents = new Map<string, string[]>()
  for (const n of inputNodes) parents.set(n.id, [])
  for (const e of inputEdges) {
    if (ids.has(e.from) && ids.has(e.to)) parents.get(e.to)!.push(e.from)
  }

  // depth = longest path from any root (memoized DFS; guard against bad-data cycles)
  const depth = new Map<string, number>()
  const computeDepth = (id: string): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    depth.set(id, 0)
    const ps = parents.get(id)!
    const d = ps.length === 0 ? 0 : Math.max(...ps.map(computeDepth)) + 1
    depth.set(id, d)
    return d
  }
  for (const n of inputNodes) computeDepth(n.id)

  const maxDepth = Math.max(0, ...depth.values())
  const columns: string[][] = Array.from({ length: maxDepth + 1 }, () => [])
  for (const n of inputNodes) columns[depth.get(n.id)!].push(n.id)

  for (const col of columns) {
    col.sort((a, b) => {
      const na = byId.get(a)!
      const nb = byId.get(b)!
      return na.sortKey - nb.sortKey || na.label.localeCompare(nb.label)
    })
  }

  // barycenter passes: pull nodes toward the average row of their parents
  const rowOf = new Map<string, number>()
  const reindex = (col: string[]) => col.forEach((id, i) => rowOf.set(id, i))
  columns.forEach(reindex)
  for (let pass = 0; pass < 3; pass++) {
    for (let c = 1; c < columns.length; c++) {
      columns[c].sort((a, b) => {
        const bary = (id: string) => {
          const ps = parents.get(id)!.filter((p) => rowOf.has(p))
          if (ps.length === 0) return rowOf.get(id)!
          return ps.reduce((s, p) => s + rowOf.get(p)!, 0) / ps.length
        }
        return bary(a) - bary(b) || rowOf.get(a)! - rowOf.get(b)!
      })
      reindex(columns[c])
    }
  }

  const nodes: LaidOutNode[] = []
  const laidById = new Map<string, LaidOutNode>()
  columns.forEach((col, c) => {
    col.forEach((id, r) => {
      const n: LaidOutNode = {
        node: byId.get(id)!,
        x: PAD + c * (NODE_W + COL_GAP),
        y: PAD + r * (NODE_H + ROW_GAP),
      }
      nodes.push(n)
      laidById.set(id, n)
    })
  })

  const edges: Layout['edges'] = []
  for (const e of inputEdges) {
    const from = laidById.get(e.from)
    const to = laidById.get(e.to)
    if (from && to) edges.push({ from, to })
  }

  const tallest = Math.max(1, ...columns.map((c) => c.length))
  return {
    nodes,
    edges,
    width: PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * COL_GAP,
    height: PAD * 2 + tallest * NODE_H + (tallest - 1) * ROW_GAP,
  }
}

function edgePath(e: Layout['edges'][number]): string {
  const x1 = e.from.x + NODE_W
  const y1 = e.from.y + NODE_H / 2
  const x2 = e.to.x
  const y2 = e.to.y + NODE_H / 2
  const mid = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
}

interface Props {
  nodes: FlowNodeInput[]
  edges: FlowEdge[]
  /** When this value changes, pan/zoom resets (e.g. switching traders). */
  resetKey?: unknown
  /** Rendered on the left side of the toolbar row. */
  toolbarLeft?: ReactNode
}

export function FlowChart({ nodes, edges, resetKey, toolbarLeft }: Props) {
  const layout = useMemo(() => layoutDag(nodes, edges), [nodes, edges])

  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 })
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setView({ x: 0, y: 0, zoom: 1 })
  }, [resetKey])

  const onPointerDown = (e: React.PointerEvent) => {
    // only pan from the background, not from node controls
    if ((e.target as HTMLElement).closest('.flow-node')) return
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: view.x, baseY: view.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    // read the ref before the updater runs — pointerup may null it out first
    const x = d.baseX + (e.clientX - d.startX)
    const y = d.baseY + (e.clientY - d.startY)
    setView((v) => ({ ...v, x, y }))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const zoomBy = (factor: number) => {
    setView((v) => {
      const zoom = Math.min(1.5, Math.max(0.3, v.zoom * factor))
      const vp = viewportRef.current
      if (!vp) return { ...v, zoom }
      const cx = vp.clientWidth / 2
      const cy = vp.clientHeight / 2
      const scale = zoom / v.zoom
      return { zoom, x: cx - (cx - v.x) * scale, y: cy - (cy - v.y) * scale }
    })
  }

  return (
    <div className="flow-chart">
      <div className="flow-toolbar">
        {toolbarLeft}
        <span className="flow-hint">drag to pan</span>
        <button className="clear-btn" onClick={() => zoomBy(1.25)}>+</button>
        <button className="clear-btn" onClick={() => zoomBy(0.8)}>−</button>
        <button className="clear-btn" onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>Reset</button>
      </div>

      <div
        ref={viewportRef}
        className="flow-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="flow-canvas"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          }}
        >
          <svg className="flow-edges" width={layout.width} height={layout.height}>
            {layout.edges.map((e, i) => (
              <path
                key={i}
                d={edgePath(e)}
                className={e.from.node.done && e.to.node.done ? 'edge done' : 'edge'}
              />
            ))}
          </svg>
          {layout.nodes.map((n) => (
            <div
              key={n.node.id}
              className={`flow-node ${n.node.done ? 'done' : ''}`}
              style={{ left: n.x, top: n.y, borderLeftColor: n.node.accentColor }}
            >
              {n.node.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
