# Tarkov Quest Tracker

An at-a-glance view of Escape from Tarkov quests by map. Two linked tables:

- **By map** — each map with a `remaining/total` count and its quests as clickable chips. Multi-map quests appear under every map they touch.
- **Quests** — one row per quest with a persistent "done" checkbox, trader, min level, Kappa flag, objective-type badges, and map badges.

Click any quest chip in the map table to jump to and highlight its row in the quest table.

## Any-location quests

The game (and the API) often label a quest "any location" even when it's really restricted to a few maps — a dangerous catch-all. So quests with no specific map are split into honest pseudo-maps, and **"Any map" is reserved for quests that are *genuinely* doable anywhere**:

- **Any map** — required objectives are purely location-agnostic: kills (`shoot`), find-in-raid items (`findItem`), or found-in-raid hand-ins. Do it on whatever map you're running (e.g. Tarkov Shooter, Punisher, Shortage).
- **Arena** — Arena questline quests (tagged `[PVE ZONE]`) whose objectives happen in Arena mode. Arena quests that have real open-world objectives show under those maps instead.
- **Map unknown** — has a location-specific objective (visit / extract / plant / mark / find quest item) but the data source didn't say which map. Flagged in amber: **check the wiki** rather than assuming any map. (Currently just "Immunity".)
- **No raid needed** — only off-raid steps: weapon builds, trader levels, non-FIR hand-ins.

The classifier never falls back to "Any map" for something that implies a place — that case always becomes "Map unknown". If a game patch adds a map-less location quest, it surfaces there instead of being silently mislabeled.

## Filters

Map chips, objective-type chips, trader dropdown, PMC-level cap, Kappa-only, hide-done, and quest-name search. All filters drive both tables and combine with AND (a quest matches the map/objective groups if it matches *any* selected chip within a group). The map table's counts respect the active non-map filters, so "what's left for me on Customs at level 15" is one glance.

**Arena (PvP) toggle** — off by default. The Arena questline (`[PVE ZONE]` quests, given mostly by Ref) requires playing Arena, so those quests are hidden entirely until you flip this on. With it off, Ref shows only his non-Arena quests (e.g. "Provide Viewership"); the total quest count drops accordingly. It's a `showArena` flag on the filter state; when off, `App.tsx` gates the whole quest list (`visibleQuests`) before deriving the tables, map chips, and progress count.

## Data & updates

Quest data comes live from the free [tarkov.dev](https://tarkov.dev) GraphQL API (`api.tarkov.dev/graphql`) on load, cached in `localStorage` for 12h (stale-while-revalidate). It reloads instantly from cache and refreshes in the background; if the API is unreachable it keeps showing cached data with an "offline" note. **Refresh data** forces a re-fetch — click it after a game patch changes quests. No manual data files to maintain.

The query uses `gameMode: pve` — this is the **PvE** version's quest list (it differs from regular/PvP). To switch to PvP, change `gameMode: pve` to `gameMode: regular` in [tarkovDev.ts](src/api/tarkovDev.ts).

For offline/standalone use the current quest data is also baked in as [snapshot.json](src/data/snapshot.json) (used as the initial seed, then refreshed live). Regenerate it by re-running the PvE query and saving `data.tasks` under `{ fetchedAt, tasks }`.

Your "done" progress lives in a separate `localStorage` key (`tarkov.done.v1`), so refreshing quest data never wipes it.

## Running it

Requires Node.js (installed at `C:\Program Files\nodejs` on this machine).

```
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # type-check + production build into dist/
```

Built with React 19 + TypeScript + Vite. No backend, no API key.
