import type { Barter, Craft, Quest, StationLevel } from '../types'

export interface ItemUsage {
  /** Quests with an objective referencing this item. */
  quests: { quest: Quest; count: number; fir: boolean }[]
  /** Hideout levels that consume this item to build. */
  stations: { level: StationLevel; count: number }[]
  /** Barters that require this item as payment. */
  barterInputs: Barter[]
  /** Barters that reward this item. */
  barterOutputs: Barter[]
  craftInputs: Craft[]
  craftOutputs: Craft[]
}

function empty(): ItemUsage {
  return { quests: [], stations: [], barterInputs: [], barterOutputs: [], craftInputs: [], craftOutputs: [] }
}

/**
 * Reverse index: item id → everywhere it shows up across quests, hideout,
 * barters and crafts. Built once from normalized data (no network).
 */
export function buildItemUsage(
  quests: Quest[],
  stations: StationLevel[],
  barters: Barter[],
  crafts: Craft[],
): Map<string, ItemUsage> {
  const map = new Map<string, ItemUsage>()
  const get = (id: string): ItemUsage => {
    let u = map.get(id)
    if (!u) map.set(id, (u = empty()))
    return u
  }

  for (const q of quests) {
    // one entry per quest per item, merging count + FIR across objectives
    const perItem = new Map<string, { count: number; fir: boolean }>()
    for (const o of q.objectives) {
      if (!o.item || o.count <= 0) continue
      const e = perItem.get(o.item.id) ?? { count: 0, fir: false }
      e.count += o.count
      if (o.foundInRaid) e.fir = true
      perItem.set(o.item.id, e)
    }
    for (const [id, e] of perItem) get(id).quests.push({ quest: q, count: e.count, fir: e.fir })
  }

  for (const l of stations) {
    for (const r of l.items) {
      if (r.count > 0) get(r.item.id).stations.push({ level: l, count: r.count })
    }
  }

  for (const b of barters) {
    for (const r of b.required) get(r.item.id).barterInputs.push(b)
    for (const r of b.reward) get(r.item.id).barterOutputs.push(b)
  }
  for (const c of crafts) {
    for (const r of c.required) get(r.item.id).craftInputs.push(c)
    for (const r of c.reward) get(r.item.id).craftOutputs.push(c)
  }

  return map
}
