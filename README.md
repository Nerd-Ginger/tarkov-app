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

Quest data comes live from the free [tarkov.dev](https://tarkov.dev) API on load, cached in `localStorage` for 12h (stale-while-revalidate). It reloads instantly from cache and refreshes in the background; if the API is unreachable it keeps showing cached data with an "offline" note. **Refresh data** forces a re-fetch — click it after a game patch changes quests. No manual data files to maintain.

**`json.tarkov.dev` is the primary source; GraphQL (`api.tarkov.dev/graphql`) is the fallback.** It used to be the other way round. GraphQL has been the unreliable half — answering HTTP 422 "server unavailable" for weeks — and JSON is also the richer source here: quest dialogue requirements (`otherRequirements`) exist only there, and JSON carries quest XP inline. GraphQL is kept rather than deleted because it's a genuinely independent path if the JSON host has an outage. A dataset served by the fallback is tagged *via backup API* in the UI.

PvE and PvP are a **header toggle**, not a code edit — it switches quests, prices, hideout, barters and crafts together. Progress is keyed by quest id, so it survives switching modes.

For offline/standalone use the current PvE data is baked in as [snapshot.json](src/data/snapshot.json) — the seed for a first run with no cache, and the merge base if a payload comes back partial. Regenerate it with:

```
npm run snapshot
```

That runs the app's own `tasksFromJson`, so the file can't drift in shape from the live pipeline. Re-run it after a patch.

Your progress lives in separate `localStorage` keys (`tarkov.done.v1`, `tarkov.active.v1`, `tarkov.failed.v1`, …), so refreshing quest data never wipes it. **Save progress** exports a versioned JSON file; older saves import with new fields defaulted so nothing is lost and nothing newly hidden.

## Running it

Requires Node.js (installed at `C:\Program Files\nodejs` on this machine).

```
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # type-check + production build into dist/
npm run snapshot  # regenerate the bundled offline data
```

Built with React 19 + TypeScript + Vite. No backend, no API key.

The production build is a **single self-contained `dist/index.html`** (`vite-plugin-singlefile`) — everything inlined, so it runs from a local file with no server.

## Deployment

Live at **[tarkov-quest-tracker.pages.dev](https://tarkov-quest-tracker.pages.dev)** on Cloudflare Pages.

Pushing to `main` deploys automatically: [.github/workflows/deploy.yml](.github/workflows/deploy.yml) checks out, installs, **typechecks**, builds, then uploads `dist/`. The typecheck runs before the build on purpose — a commit that doesn't compile fails in Actions rather than reaching the live site.

`dist/` is gitignored, so CI builds from source and the live site can't drift from what's on `main`.

The Action needs two repository secrets: `CLOUDFLARE_API_TOKEN` (a custom token with `Account → Cloudflare Pages → Edit`) and `CLOUDFLARE_ACCOUNT_ID`.

To deploy by hand instead — no token needed, uses your local `wrangler login`:

```
npm run deploy
```
