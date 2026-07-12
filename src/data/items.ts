import type { ItemRef, Quest, StationLevel } from '../types'

export interface ItemDelta {
  item: ItemRef
  count: number
}

/**
 * Items consumed when a quest is turned in — hand-in objectives only (giveItem/
 * plantItem/sellItem). findItem objectives are the acquisition step of the same
 * items and never count, or Shortage-style quests would double.
 */
export function questHandInItems(q: Quest): ItemDelta[] {
  const byId = new Map<string, ItemDelta>()
  for (const o of q.objectives) {
    if (!o.handIn || o.optional || !o.item || o.count <= 0) continue
    const existing = byId.get(o.item.id)
    if (existing) existing.count += o.count
    else byId.set(o.item.id, { item: o.item, count: o.count })
  }
  return [...byId.values()]
}

export interface QuestSource {
  quest: Quest
  count: number
  foundInRaid: boolean
}

export interface StationSource {
  level: StationLevel
  count: number
}

export interface ItemNeed {
  item: ItemRef
  questCount: number
  /** Portion of questCount that must be found in raid. */
  questFirCount: number
  hideoutCount: number
  total: number
  questSources: QuestSource[]
  stationSources: StationSource[]
}

/**
 * Aggregate outstanding item needs across not-done quests and unbuilt hideout
 * levels. Done/built things contribute nothing — their needs are behind you.
 */
export function aggregateNeeds(
  quests: Quest[],
  done: Set<string>,
  stations: StationLevel[],
  built: Set<string>,
): ItemNeed[] {
  const byId = new Map<string, ItemNeed>()
  const get = (item: ItemRef): ItemNeed => {
    let need = byId.get(item.id)
    if (!need) {
      need = { item, questCount: 0, questFirCount: 0, hideoutCount: 0, total: 0, questSources: [], stationSources: [] }
      byId.set(item.id, need)
    }
    return need
  }

  for (const q of quests) {
    if (done.has(q.id)) continue
    // group per item within the quest so FIR flags merge sensibly
    const perItem = new Map<string, { item: ItemRef; count: number; fir: number }>()
    for (const o of q.objectives) {
      if (!o.handIn || o.optional || !o.item || o.count <= 0) continue
      let e = perItem.get(o.item.id)
      if (!e) perItem.set(o.item.id, (e = { item: o.item, count: 0, fir: 0 }))
      e.count += o.count
      if (o.foundInRaid) e.fir += o.count
    }
    for (const e of perItem.values()) {
      const need = get(e.item)
      need.questCount += e.count
      need.questFirCount += e.fir
      need.questSources.push({ quest: q, count: e.count, foundInRaid: e.fir > 0 })
    }
  }

  for (const l of stations) {
    if (built.has(l.key)) continue
    for (const r of l.items) {
      if (r.count <= 0) continue
      const need = get(r.item)
      need.hideoutCount += r.count
      need.stationSources.push({ level: l, count: r.count })
    }
  }

  const needs = [...byId.values()]
  for (const n of needs) n.total = n.questCount + n.hideoutCount
  needs.sort((a, b) => a.item.name.localeCompare(b.item.name))
  return needs
}
