import { useCallback, useState } from 'react'

// Module-level store: survives a view unmounting/remounting when you switch
// buckets (the module stays loaded), but resets on a full page reload — by design.
const store = new Map<string, Set<string>>()

/**
 * Collapsible group state for a grouped table. Defaults to all-collapsed (empty
 * set = nothing expanded) and is keyed per view so each bucket keeps its own
 * expand/collapse layout as you navigate between them.
 */
export function useExpandedGroups(viewKey: string) {
  const [expanded, setExpanded] = useState<Set<string>>(() => store.get(viewKey) ?? new Set())

  const write = useCallback(
    (next: Set<string>) => {
      store.set(viewKey, next)
      setExpanded(next)
    },
    [viewKey],
  )

  const toggle = useCallback(
    (name: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        store.set(viewKey, next)
        return next
      })
    },
    [viewKey],
  )

  const expandAll = useCallback((names: string[]) => write(new Set(names)), [write])
  const collapseAll = useCallback(() => write(new Set()), [write])

  return { expanded, toggle, expandAll, collapseAll }
}
