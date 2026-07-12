import { useCallback, useState } from 'react'
import type { ItemDelta } from '../data/items'

const INV_KEY = 'tarkov.inventory.v1'

export type Inventory = Record<string, number>

function readInventory(): Inventory {
  try {
    const raw = localStorage.getItem(INV_KEY)
    const parsed = raw ? (JSON.parse(raw) as Inventory) : {}
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function persist(inv: Inventory) {
  try {
    localStorage.setItem(INV_KEY, JSON.stringify(inv))
  } catch {
    // storage unavailable — state still works this session
  }
}

function clean(inv: Inventory): Inventory {
  const next: Inventory = {}
  for (const [id, n] of Object.entries(inv)) {
    if (typeof n === 'number' && n > 0) next[id] = Math.floor(n)
  }
  return next
}

export function useInventory() {
  const [inventory, setInventory] = useState<Inventory>(readInventory)

  const setCount = useCallback((itemId: string, count: number) => {
    setInventory((prev) => {
      const next = { ...prev }
      if (count > 0) next[itemId] = Math.floor(count)
      else delete next[itemId]
      persist(next)
      return next
    })
  }, [])

  /** Apply hand-in deltas: sign -1 consumes (floored at 0), +1 restores. */
  const applyDeltas = useCallback((deltas: ItemDelta[], sign: 1 | -1) => {
    if (deltas.length === 0) return
    setInventory((prev) => {
      const next = { ...prev }
      for (const d of deltas) {
        const cur = next[d.item.id] ?? 0
        const val = Math.max(0, cur + sign * d.count)
        if (val > 0) next[d.item.id] = val
        else delete next[d.item.id]
      }
      persist(next)
      return next
    })
  }, [])

  const replaceInventory = useCallback((inv: Inventory) => {
    const next = clean(inv)
    persist(next)
    setInventory(next)
  }, [])

  return { inventory, setCount, applyDeltas, replaceInventory }
}
