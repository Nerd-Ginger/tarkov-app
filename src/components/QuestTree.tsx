import { useMemo, useRef, useState } from 'react'
import type { Quest } from '../types'
import { traderSortKey } from '../data/normalize'

const NODE_W = 190
const NODE_H = 44
const COL_GAP = 70
const ROW_GAP = 14
const PAD = 30

interface LaidOutNode {
  quest: Quest
  x: number
  y: number
}

interface Edge {
  from: LaidOutNode
  to: LaidOutNode
}

interface Layout {
  nodes: LaidOutNode[]
  edges: Edge[]
  width: number
  height: number
}

/**
 * Layered DAG layout: column = longest prerequisite chain from a root (within
 * this trader), row order via a couple of barycenter passes so children sit
 * near their parents and edges stay mostly horizontal.
 */
function layoutTrader(traderQuests: Quest[]): Layout {
  const ids = new Set(traderQuests.map((q) => q.id))
  const byId = new Map(traderQuests.map((q) => [q.id, q]))
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  for (const q of traderQuests) {
    const ps = q.requires.filter((id) => ids.has(id))
    parents.set(q.id, ps)
    for (const p of ps) {
      let list = children.get(p)
      if (!list) children.set(p, (list = []))
      list.push(q.id)
    }
  }

  // depth = longest path from any root (memoized DFS; data is acyclic)
  const depth = new Map<string, number>()
  const computeDepth = (id: string): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    depth.set(id, 0) // guard against bad data cycles
    const ps = parents.get(id)!
    const d = ps.length === 0 ? 0 : Math.max(...ps.map(computeDepth)) + 1
    depth.set(id, d)
    return d
  }
  for (const q of traderQuests) computeDepth(q.id)

  // group into columns
  const maxDepth = Math.max(0, ...depth.values())
  const columns: string[][] = Array.from({ length: maxDepth + 1 }, () => [])
  for (const q of traderQuests) columns[depth.get(q.id)!].push(q.id)

  // initial order: by level then name
  for (const col of columns) {
    col.sort((a, b) => {
      const qa = byId.get(a)!
      const qb = byId.get(b)!
      return qa.minLevel - qb.minLevel || qa.name.localeCompare(qb.name)
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
  const nodeById = new Map<string, LaidOutNode>()
  columns.forEach((col, c) => {
    col.forEach((id, r) => {
      const n: LaidOutNode = {
        quest: byId.get(id)!,
        x: PAD + c * (NODE_W + COL_GAP),
        y: PAD + r * (NODE_H + ROW_GAP),
      }
      nodes.push(n)
      nodeById.set(id, n)
    })
  })

  const edges: Edge[] = []
  for (const q of traderQuests) {
    for (const p of parents.get(q.id)!) {
      edges.push({ from: nodeById.get(p)!, to: nodeById.get(q.id)! })
    }
  }

  const tallest = Math.max(1, ...columns.map((c) => c.length))
  return {
    nodes,
    edges,
    width: PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * COL_GAP,
    height: PAD * 2 + tallest * NODE_H + (tallest - 1) * ROW_GAP,
  }
}

function levelColor(level: number): string {
  if (level <= 5) return 'var(--cat-extract)'
  if (level <= 15) return 'var(--accent)'
  if (level <= 25) return 'var(--cat-plant)'
  if (level <= 35) return 'var(--cat-kill)'
  if (level <= 45) return 'var(--cat-build)'
  return 'var(--cat-other)'
}

function edgePath(e: Edge): string {
  const x1 = e.from.x + NODE_W
  const y1 = e.from.y + NODE_H / 2
  const x2 = e.to.x
  const y2 = e.to.y + NODE_H / 2
  const mid = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
}

interface Props {
  quests: Quest[]
  done: Set<string>
  onToggleDone: (id: string) => void
  onQuestClick: (q: Quest) => void
}

export function QuestTree({ quests, done, onToggleDone, onQuestClick }: Props) {
  const traders = useMemo(() => {
    const s = new Set(quests.map((q) => q.trader))
    return [...s].sort((a, b) => traderSortKey(a) - traderSortKey(b))
  }, [quests])

  const [trader, setTrader] = useState<string | null>(null)
  const activeTrader = trader && traders.includes(trader) ? trader : traders[0]

  const layout = useMemo(() => {
    if (!activeTrader) return null
    return layoutTrader(quests.filter((q) => q.trader === activeTrader))
  }, [quests, activeTrader])

  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 })
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

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
      // zoom around viewport center
      const vp = viewportRef.current
      if (!vp) return { ...v, zoom }
      const cx = vp.clientWidth / 2
      const cy = vp.clientHeight / 2
      const scale = zoom / v.zoom
      return { zoom, x: cx - (cx - v.x) * scale, y: cy - (cy - v.y) * scale }
    })
  }

  const resetView = () => setView({ x: 0, y: 0, zoom: 1 })

  const selectTrader = (t: string) => {
    setTrader(t)
    resetView()
  }

  if (!activeTrader || !layout) return <p className="empty-note">No quests to chart.</p>

  const traderDone = quests.filter((q) => q.trader === activeTrader && done.has(q.id)).length
  const traderTotal = quests.filter((q) => q.trader === activeTrader).length

  return (
    <div className="flow-chart">
      <div className="flow-traders">
        {traders.map((t) => (
          <button
            key={t}
            className={`chip ${t === activeTrader ? 'active' : ''}`}
            onClick={() => selectTrader(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flow-toolbar">
        <span className="flow-progress">
          {activeTrader}: {traderDone}/{traderTotal} done
        </span>
        <span className="flow-hint">drag to pan</span>
        <button className="clear-btn" onClick={() => zoomBy(1.25)}>+</button>
        <button className="clear-btn" onClick={() => zoomBy(0.8)}>−</button>
        <button className="clear-btn" onClick={resetView}>Reset</button>
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
                className={done.has(e.to.quest.id) && done.has(e.from.quest.id) ? 'edge done' : 'edge'}
              />
            ))}
          </svg>
          {layout.nodes.map((n) => {
            const q = n.quest
            const isDone = done.has(q.id)
            return (
              <div
                key={q.id}
                className={`flow-node ${isDone ? 'done' : ''}`}
                style={{ left: n.x, top: n.y, borderLeftColor: levelColor(q.minLevel) }}
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => onToggleDone(q.id)}
                  className="tree-check"
                />
                <button className="flow-node-name" onClick={() => onQuestClick(q)} title={q.name}>
                  {q.name}
                </button>
                <span className="flow-node-level">
                  {q.minLevel > 0 ? `${q.minLevel}` : '–'}
                  {q.kappa && <span className="kappa-badge">κ</span>}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
