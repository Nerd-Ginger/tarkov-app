import { useMemo, useState } from 'react'
import type { KeyLock, PriceRow } from '../types'
import { mapSortKey } from '../data/normalize'
import { useExpandedGroups } from '../hooks/useExpandedGroups'
import type { FavoriteProps } from '../hooks/useFavorites'
import { FAVORITES_GROUP, groupIsOpen } from '../data/favorites'
import { FavoriteStar, FavoritesToggle } from './FavoriteStar'

interface Props extends FavoriteProps {
  keys: KeyLock[]
  prices: Map<string, PriceRow>
}

interface KeyRow {
  keyId: string
  name: string
  short: string
  wiki: string
  /** lockType → count of locks this key opens on the map. */
  opens: Map<string, number>
  needsPower: boolean
  value: number | null
  slots: number
}

const MAP_BASE_URL = 'https://tarkov.dev/map/'

const rub = (n: number | null) => (n == null ? '—' : `₽${Math.round(n).toLocaleString()}`)

/** "3 doors · 1 trunk" from the lockType→count map. */
function opensLabel(opens: Map<string, number>): string {
  return [...opens.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${n} ${type}${n === 1 ? '' : 's'}`)
    .join(' · ')
}

export function KeysView({ keys, prices, favorites, pinned, onToggleFavorite, onTogglePinned }: Props) {
  const [search, setSearch] = useState('')
  const { expanded, toggle, expandAll, collapseAll } = useExpandedGroups('keys')

  // map → deduped key rows (a key can open several locks on one map)
  const groups = useMemo(() => {
    const byMap = new Map<string, Map<string, KeyRow>>()
    const slugByMap: Record<string, string> = {}
    for (const k of keys) {
      if (k.mapSlug) slugByMap[k.map] = k.mapSlug
      let mapKeys = byMap.get(k.map)
      if (!mapKeys) byMap.set(k.map, (mapKeys = new Map()))
      let row = mapKeys.get(k.keyId)
      if (!row) {
        const p = prices.get(k.keyId)
        row = {
          keyId: k.keyId,
          name: k.keyName,
          short: k.keyShort,
          wiki: k.keyWiki,
          opens: new Map(),
          needsPower: false,
          value: p?.flea ?? (p && p.trader > 0 ? p.trader : null),
          slots: p?.slots ?? 1,
        }
        mapKeys.set(k.keyId, row)
      }
      row.opens.set(k.lockType, (row.opens.get(k.lockType) ?? 0) + 1)
      if (k.needsPower) row.needsPower = true
    }

    const s = search.trim().toLowerCase()
    const entries: { map: string; slug: string; rows: KeyRow[] }[] = []
    for (const [map, mapKeys] of byMap) {
      let rows = [...mapKeys.values()]
      if (s) rows = rows.filter((r) => r.name.toLowerCase().includes(s) || r.short.toLowerCase().includes(s))
      if (rows.length === 0) continue
      // most valuable first — the "value behind the door" proxy
      rows.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.name.localeCompare(b.name))
      entries.push({ map, slug: slugByMap[map] ?? '', rows })
    }
    entries.sort((a, b) => mapSortKey(a.map) - mapSortKey(b.map))
    // groups here are objects rather than [name, rows] tuples, so the shared
    // helper doesn't fit — same idea, gathered from the already-filtered rows
    if (pinned && favorites.size > 0) {
      const seen = new Set<string>()
      const starred: KeyRow[] = []
      for (const g of entries) {
        for (const r of g.rows) {
          if (favorites.has(r.keyId) && !seen.has(r.keyId)) {
            seen.add(r.keyId)
            starred.push(r)
          }
        }
      }
      if (starred.length > 0) entries.unshift({ map: FAVORITES_GROUP, slug: '', rows: starred })
    }
    return entries
  }, [keys, prices, search, favorites, pinned])

  const isOpen = (map: string) => groupIsOpen(map, expanded, search)

  const allMaps = groups.map((g) => g.map)

  if (keys.length === 0) return <p className="empty-note">No key data loaded.</p>

  return (
    <div className="keys-view">
      <div className="filter-bar">
        <div className="filter-row controls">
          <input type="search" placeholder="Search keys…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <FavoritesToggle pinned={pinned} onToggle={onTogglePinned} />
          <button className="clear-btn" onClick={() => expandAll(allMaps)}>Expand all</button>
          <button className="clear-btn" onClick={collapseAll}>Collapse all</button>
          <span className="flow-hint">value = key's flea/trader price — a proxy for what's behind the door</span>
        </div>
      </div>

      <div className="table-wrap trade-scroll">
        <table className="keys-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Opens</th>
              <th className="num-col">Value</th>
              <th className="num-col">₽/slot</th>
              <th>Wiki</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ map, slug, rows }) => (
              <MapKeys key={map} map={map} slug={slug} rows={rows} open={isOpen(map)} onToggle={() => toggle(map)} favorites={favorites} onToggleFavorite={onToggleFavorite} />
            ))}
          </tbody>
        </table>
      </div>
      {groups.length === 0 && <p className="empty-note">No keys match.</p>}
    </div>
  )
}

function MapKeys({ map, slug, rows, open, onToggle, favorites, onToggleFavorite }: {
  map: string
  slug: string
  rows: KeyRow[]
  open: boolean
  onToggle: () => void
  favorites: Set<string>
  onToggleFavorite: (id: string) => void
}) {
  return (
    <>
      <tr className="caliber-row" onClick={onToggle}>
        <td colSpan={5}>
          <span className={`collapse-arrow ${open ? 'open' : ''}`}>&#9654;</span>
          {map}
          <span className="caliber-count">{rows.length} key{rows.length === 1 ? '' : 's'}</span>
          {slug && (
            <a
              className="map-link"
              href={`${MAP_BASE_URL}${slug}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`Interactive ${map} map — every key location plotted`}
            >
              🗺 map ↗
            </a>
          )}
        </td>
      </tr>
      {open &&
        rows.map((r) => (
          <tr key={r.keyId}>
            <td className="key-name">
              <FavoriteStar id={r.keyId} favorites={favorites} onToggle={onToggleFavorite} />
              {r.name}
              {r.needsPower && <span className="power-tag" title="The lock needs power switched on">⚡ power</span>}
            </td>
            <td className="key-opens">{opensLabel(r.opens)}</td>
            <td className="num-col flea-price">{rub(r.value)}</td>
            <td className="num-col">{r.value != null ? rub(r.value / r.slots) : '—'}</td>
            <td>
              {r.wiki && (
                <a
                  className="wiki-link key-wiki"
                  href={r.wiki}
                  target="_blank"
                  rel="noreferrer"
                  title="Wiki: exact location and loot behind the door"
                >
                  where + loot ↗
                </a>
              )}
            </td>
          </tr>
        ))}
    </>
  )
}
