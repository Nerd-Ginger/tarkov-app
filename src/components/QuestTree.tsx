import { useMemo, useState } from 'react'
import type { Quest } from '../types'
import { traderSortKey } from '../data/normalize'

interface TreeNode {
  quest: Quest
  children: TreeNode[]
}

function buildTrees(quests: Quest[]): Map<string, TreeNode[]> {
  const byId = new Map<string, Quest>()
  for (const q of quests) byId.set(q.id, q)

  const byTrader = new Map<string, Quest[]>()
  for (const q of quests) {
    let list = byTrader.get(q.trader)
    if (!list) byTrader.set(q.trader, (list = []))
    list.push(q)
  }

  const result = new Map<string, TreeNode[]>()

  for (const [trader, traderQuests] of byTrader) {
    const traderIds = new Set(traderQuests.map((q) => q.id))
    const nodes = new Map<string, TreeNode>()
    for (const q of traderQuests) nodes.set(q.id, { quest: q, children: [] })

    const roots: TreeNode[] = []
    for (const q of traderQuests) {
      const sameTraderParents = q.requires.filter((id) => traderIds.has(id))
      if (sameTraderParents.length === 0) {
        roots.push(nodes.get(q.id)!)
      } else {
        for (const pid of sameTraderParents) {
          nodes.get(pid)?.children.push(nodes.get(q.id)!)
        }
      }
    }

    for (const node of nodes.values()) {
      node.children.sort((a, b) => a.quest.minLevel - b.quest.minLevel || a.quest.name.localeCompare(b.quest.name))
    }
    roots.sort((a, b) => a.quest.minLevel - b.quest.minLevel || a.quest.name.localeCompare(b.quest.name))

    result.set(trader, roots)
  }

  return result
}

function levelColor(level: number): string {
  if (level <= 5) return 'var(--cat-extract)'
  if (level <= 15) return 'var(--accent)'
  if (level <= 25) return 'var(--cat-plant)'
  if (level <= 35) return 'var(--cat-kill)'
  if (level <= 45) return 'var(--cat-build)'
  return 'var(--cat-other)'
}

function TreeNodeView({ node, done, onToggleDone, onQuestClick, depth }: {
  node: TreeNode; done: Set<string>; onToggleDone: (id: string) => void
  onQuestClick: (q: Quest) => void; depth: number
}) {
  const q = node.quest
  const isDone = done.has(q.id)

  return (
    <div className="tree-branch">
      <div className={`tree-node ${isDone ? 'done' : ''}`} style={{ borderLeftColor: levelColor(q.minLevel) }}>
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => onToggleDone(q.id)}
          className="tree-check"
        />
        <button className="tree-quest-name" onClick={() => onQuestClick(q)}>
          {q.name}
        </button>
        <span className="tree-level">Lv {q.minLevel}</span>
        {q.kappa && <span className="kappa-badge">κ</span>}
      </div>
      {node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNodeView
              key={child.quest.id}
              node={child}
              done={done}
              onToggleDone={onToggleDone}
              onQuestClick={onQuestClick}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  quests: Quest[]
  done: Set<string>
  onToggleDone: (id: string) => void
  onQuestClick: (q: Quest) => void
}

export function QuestTree({ quests, done, onToggleDone, onQuestClick }: Props) {
  const trees = useMemo(() => buildTrees(quests), [quests])
  const traders = useMemo(
    () => [...trees.keys()].sort((a, b) => traderSortKey(a) - traderSortKey(b)),
    [trees],
  )
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleTrader = (trader: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(trader)) next.delete(trader)
      else next.add(trader)
      return next
    })
  }

  return (
    <div className="quest-trees">
      {traders.map((trader) => {
        const roots = trees.get(trader)!
        const total = quests.filter((q) => q.trader === trader).length
        const doneCount = quests.filter((q) => q.trader === trader && done.has(q.id)).length
        const isOpen = !collapsed.has(trader)
        return (
          <div key={trader} className="trader-tree">
            <h3 className="trader-tree-header" onClick={() => toggleTrader(trader)}>
              <span className={`collapse-arrow ${isOpen ? 'open' : ''}`}>&#9654;</span>
              {trader}
              <span className="trader-tree-count">{doneCount}/{total}</span>
            </h3>
            {isOpen && (
              <div className="trader-tree-body">
                {roots.map((root) => (
                  <TreeNodeView
                    key={root.quest.id}
                    node={root}
                    done={done}
                    onToggleDone={onToggleDone}
                    onQuestClick={onQuestClick}
                    depth={0}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
