import type { Quest } from '../types'
import { isBlocked } from '../filters'

export interface BestQuest {
  quest: Quest
  /** Not-yet-done quests transitively gated behind this one. */
  unblocks: number
}

/**
 * "Best Quests" = the quests you can do RIGHT NOW (not done, not locked) whose
 * completion unblocks the largest share of the remaining quest tree. Score =
 * size of the transitive dependent set over blocking-prerequisite edges,
 * counting only quests that aren't done yet.
 */
export function bestQuests(quests: Quest[], done: Set<string>, topN = 5): BestQuest[] {
  const byId = new Map(quests.map((q) => [q.id, q]))

  // prereq -> direct dependents (blocking edges only, within the visible set)
  const dependents = new Map<string, string[]>()
  for (const q of quests) {
    for (const p of q.blockingRequires) {
      if (!byId.has(p)) continue
      let list = dependents.get(p)
      if (!list) dependents.set(p, (list = []))
      list.push(q.id)
    }
  }

  const candidates = quests.filter((q) => !done.has(q.id) && !isBlocked(q, done))

  const scored = candidates.map((quest) => {
    const seen = new Set<string>()
    const stack = [...(dependents.get(quest.id) ?? [])]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      const next = dependents.get(id)
      if (next) stack.push(...next)
    }
    let unblocks = 0
    for (const id of seen) if (!done.has(id)) unblocks++
    return { quest, unblocks }
  })

  scored.sort(
    (a, b) =>
      b.unblocks - a.unblocks ||
      a.quest.minLevel - b.quest.minLevel ||
      a.quest.name.localeCompare(b.quest.name),
  )
  return scored.slice(0, topN)
}
