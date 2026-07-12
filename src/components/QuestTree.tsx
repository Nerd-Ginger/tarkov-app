import { useMemo, useState } from 'react'
import type { Quest } from '../types'
import { traderSortKey } from '../data/normalize'
import { FlowChart } from './FlowChart'
import type { FlowEdge, FlowNodeInput } from './FlowChart'

export function levelColor(level: number): string {
  if (level <= 5) return 'var(--cat-extract)'
  if (level <= 15) return 'var(--accent)'
  if (level <= 25) return 'var(--cat-plant)'
  if (level <= 35) return 'var(--cat-kill)'
  if (level <= 45) return 'var(--cat-build)'
  return 'var(--cat-other)'
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

  const traderQuests = useMemo(
    () => quests.filter((q) => q.trader === activeTrader),
    [quests, activeTrader],
  )

  const { nodes, edges } = useMemo(() => {
    const ids = new Set(traderQuests.map((q) => q.id))
    const nodes: FlowNodeInput[] = traderQuests.map((q) => ({
      id: q.id,
      accentColor: levelColor(q.minLevel),
      done: done.has(q.id),
      sortKey: q.minLevel,
      label: q.name,
      content: (
        <>
          <input
            type="checkbox"
            checked={done.has(q.id)}
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
        </>
      ),
    }))
    const edges: FlowEdge[] = []
    for (const q of traderQuests) {
      for (const p of q.requires) {
        if (ids.has(p)) edges.push({ from: p, to: q.id })
      }
    }
    return { nodes, edges }
  }, [traderQuests, done, onToggleDone, onQuestClick])

  if (!activeTrader) return <p className="empty-note">No quests to chart.</p>

  const traderDone = traderQuests.filter((q) => done.has(q.id)).length

  return (
    <div className="flow-section">
      <div className="flow-traders">
        {traders.map((t) => (
          <button
            key={t}
            className={`chip ${t === activeTrader ? 'active' : ''}`}
            onClick={() => setTrader(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <FlowChart
        nodes={nodes}
        edges={edges}
        resetKey={activeTrader}
        toolbarLeft={
          <span className="flow-progress">
            {activeTrader}: {traderDone}/{traderQuests.length} done
          </span>
        }
      />
    </div>
  )
}
