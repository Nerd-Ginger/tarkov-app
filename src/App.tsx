/**
 * Tarkov Quest Tracker
 * Author: Nerd_Ginger — https://github.com/Nerd-Ginger/tarkov-app
 * Quest & item data from the tarkov.dev API.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AmmoView } from './components/AmmoView'
import { StimsView } from './components/StimsView'
import { BossesView } from './components/BossesView'
import { FireSaleView } from './components/FireSaleView'
import { KeysView } from './components/KeysView'
import { ItemModal } from './components/ItemModal'
import { BartersView } from './components/BartersView'
import { BestQuests } from './components/BestQuests'
import { CraftsView } from './components/CraftsView'
import { BackupApiTag } from './components/BackupApiTag'
import { ProfileView } from './components/ProfileView'
import { TradeModal } from './components/TradeModal'
import type { TradeModalData } from './components/TradeModal'
import { bestQuests, bestRewardQuests } from './data/bestQuests'
import { FilterBar } from './components/FilterBar'
import { HideoutView } from './components/HideoutView'
import { ItemsView } from './components/ItemsView'
import { MapsSection } from './components/MapsSection'
import { QuestModal } from './components/QuestModal'
import { QuestTree } from './components/QuestTree'
import { QuestsTable } from './components/QuestsTable'
import { questHandInItems } from './data/items'
import { EVENT_MAPS, isPseudoMap, mapSortKey, stationLevelKey, traderSortKey } from './data/normalize'
import { exportProgress, importProgress } from './data/progressFile'
import { EMPTY_FILTERS, isBlocked, matchesAll } from './filters'
import { GATED_TRADERS, lockedTraders, questUnlockedTraders, unlockQuestFor } from './data/traderGate'
import type { Filters } from './filters'
import type { Barter, Craft, ItemRef, Quest } from './types'
import { useActive } from './hooks/useActive'
import { useDone } from './hooks/useDone'
import { useHideout } from './hooks/useHideout'
import { useInventory } from './hooks/useInventory'
import { useIntel } from './hooks/useIntel'
import { usePrices } from './hooks/usePrices'
import { useProfile } from './hooks/useProfile'
import { useFavorites } from './hooks/useFavorites'
import { buildItemUsage } from './data/itemUsage'
import { useQuestData } from './hooks/useQuestData'
import { useQuestProgress } from './hooks/useQuestProgress'

const REPO_URL = 'https://github.com/Nerd-Ginger/tarkov-app'

type View =
  | 'quests'
  | 'best'
  | 'items'
  | 'hideout'
  | 'barters'
  | 'crafts'
  | 'firesale'
  | 'keys'
  | 'bosses'
  | 'ammo'
  | 'stims'
  | 'profile'
const VIEW_KEY = 'tarkov.view.v1'
const VIEWS: { id: View; label: string }[] = [
  { id: 'quests', label: 'Quests' },
  { id: 'best', label: 'Best Quests' },
  { id: 'items', label: 'Items' },
  { id: 'hideout', label: 'Hideout' },
  { id: 'barters', label: 'Barter' },
  { id: 'crafts', label: 'Crafts' },
  { id: 'firesale', label: 'Fire Sale' },
  { id: 'keys', label: 'Keys' },
  { id: 'bosses', label: 'Bosses' },
  { id: 'ammo', label: 'Ammo' },
  { id: 'stims', label: 'Stims' },
  { id: 'profile', label: 'Profile' },
]

const OTHER_VIEWS = new Set<string>([
  'best',
  'items',
  'hideout',
  'barters',
  'crafts',
  'firesale',
  'keys',
  'bosses',
  'ammo',
  'stims',
  'profile',
])

/** Views that show flea prices — visiting one triggers the lazy price fetch. */
const PRICE_VIEWS = new Set<View>(['items', 'barters', 'crafts', 'firesale', 'keys'])
/** Views that need trader-reset / goon / boss intel. */
const INTEL_VIEWS = new Set<View>(['barters', 'bosses', 'firesale'])

function readView(): View {
  const v = localStorage.getItem(VIEW_KEY)
  return v && OTHER_VIEWS.has(v) ? (v as View) : 'quests'
}

function timeAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

export default function App() {
  const {
    quests, stations, ammo, barters, crafts, keys, stims, status, offline, fetchedAt,
    source: questSource, refresh,
  } = useQuestData()
  const { done, toggle, replaceDone } = useDone()
  const { inventory, setCount, applyDeltas, replaceInventory } = useInventory()
  const { built, replaceBuilt } = useHideout()
  const { progress, setObjective, replaceProgress } = useQuestProgress()
  const { active, toggleActive, clearActive, replaceActive } = useActive()
  const { profile, setPmcLevel, setTraderLevel, setTraderUnlocked, replaceProfile } = useProfile()
  const { favorites, pinned, toggleFavorite, togglePinned, replaceFavorites } = useFavorites()
  // one bundle, passed to every list view
  const favProps = { favorites, pinned, onToggleFavorite: toggleFavorite, onTogglePinned: togglePinned }
  const {
    rows: priceRows,
    byId: pricesById,
    fetchedAt: pricesFetchedAt,
    source: pricesSource,
    loading: pricesLoading,
    offline: pricesOffline,
    ensureFresh: ensureFreshPrices,
    refresh: refreshPrices,
  } = usePrices()
  const {
    intel,
    fetchedAt: intelFetchedAt,
    source: intelSource,
    loading: intelLoading,
    offline: intelOffline,
    ensureFresh: ensureFreshIntel,
    refresh: refreshIntel,
  } = useIntel()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [detailQuest, setDetailQuest] = useState<Quest | null>(null)
  const [tradeModal, setTradeModal] = useState<TradeModalData | null>(null)
  const [itemModal, setItemModal] = useState<ItemRef | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mapsOpen, setMapsOpen] = useState(true)
  const [treeOpen, setTreeOpen] = useState(false)
  const [questsOpen, setQuestsOpen] = useState(true)
  const [bestMaps, setBestMaps] = useState<Set<string>>(new Set())
  const [bestTraders, setBestTraders] = useState<Set<string>>(new Set())
  const [view, setView] = useState<View>(readView)

  const toggleInSet = (set: Set<string>, v: string) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  const toggleBestMap = (m: string) => setBestMaps((prev) => toggleInSet(prev, m))
  const toggleBestTrader = (t: string) => setBestTraders((prev) => toggleInSet(prev, t))

  const switchView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // fine — view just won't persist
    }
  }

  // Prices load lazily: only once a price-showing view is opened, then hourly.
  useEffect(() => {
    if (PRICE_VIEWS.has(view)) ensureFreshPrices()
    if (INTEL_VIEWS.has(view)) ensureFreshIntel()
  }, [view, ensureFreshPrices, ensureFreshIntel])

  const questById = useMemo(() => new Map(quests.map((q) => [q.id, q])), [quests])
  const levelByKey = useMemo(() => new Map(stations.map((l) => [l.key, l])), [stations])

  // Completing a quest consumes its hand-in items from the inventory;
  // unchecking restores them. Same deal for hideout builds.
  const toggleQuest = useCallback(
    (id: string) => {
      const q = questById.get(id)
      if (q) applyDeltas(questHandInItems(q), done.has(id) ? 1 : -1)
      // finishing an active quest ends its active status
      if (!done.has(id)) clearActive(id)
      toggle(id)
    },
    [questById, done, applyDeltas, toggle, clearActive],
  )

  /**
   * "Active" = currently running this quest in game — which means everything
   * before it must already be complete. Activating marks the whole prerequisite
   * chain done in one shot (catch-up sync; deliberately NO inventory math —
   * that behavior belongs to manual checkmarks). Toggling off just clears the flag.
   */
  const activateQuest = useCallback(
    (id: string) => {
      if (!active.has(id)) {
        const ancestors = new Set<string>()
        const stack = [...(questById.get(id)?.blockingRequires ?? [])]
        while (stack.length) {
          const pid = stack.pop()!
          if (ancestors.has(pid)) continue
          const pq = questById.get(pid)
          if (!pq) continue
          ancestors.add(pid)
          stack.push(...pq.blockingRequires)
        }
        const newlyDone = [...ancestors].filter((pid) => !done.has(pid))
        // Marking a whole chain done is a big, irreversible action — confirm it so
        // an accidental Active click on a far-ahead quest can't silently complete
        // dozens of quests you haven't actually done.
        if (newlyDone.length > 0) {
          const name = questById.get(id)?.name ?? 'this quest'
          const ok = window.confirm(
            `Set "${name}" as active?\n\n` +
              `This also marks ${newlyDone.length} earlier quest${newlyDone.length === 1 ? '' : 's'} ` +
              `complete — you can't reach this one without finishing them. Inventory isn't affected.\n\n` +
              `Cancel if you haven't actually done those quests yet.`,
          )
          if (!ok) return
          replaceDone([...done, ...newlyDone])
        }
      }
      toggleActive(id)
    },
    [active, questById, done, replaceDone, toggleActive],
  )

  // Station levels are cumulative: you can't have Generator 3 without 1 & 2.
  // So building a level also builds every lower level; un-building removes every
  // higher level. Inventory is charged/refunded per newly-changed level only.
  const toggleLevel = useCallback(
    (key: string) => {
      const target = levelByKey.get(key)
      if (!target) return
      const building = !built.has(key)
      const siblings = stations.filter((l) => l.stationId === target.stationId)
      const changed = building
        ? siblings.filter((l) => l.level <= target.level && !built.has(l.key))
        : siblings.filter((l) => l.level >= target.level && built.has(l.key))
      for (const l of changed) {
        applyDeltas(l.items.map((r) => ({ item: r.item, count: r.count })), building ? -1 : 1)
      }
      const next = new Set(built)
      for (const l of changed) building ? next.add(l.key) : next.delete(l.key)
      replaceBuilt([...next])
    },
    [levelByKey, built, stations, applyDeltas, replaceBuilt],
  )

  const resetForWipe = () => {
    const ok = window.confirm(
      'Reset all tracked progress for a new wipe?\n\n' +
        'This clears completed quests, active quests, quest objective progress, ' +
        'inventory counts, hideout builds, and trader/PMC levels.\n\n' +
        'This cannot be undone — use Save progress first if you want a backup.',
    )
    if (!ok) return
    replaceDone([])
    replaceActive([])
    replaceProgress({})
    replaceInventory({})
    replaceBuilt([])
    replaceProfile({ pmcLevel: 1, traders: {}, unlockedTraders: {} })
    replaceFavorites([])
  }

  const saveProgress = () => exportProgress(done, inventory, built, progress, active, profile, favorites)
  const loadProgress = () =>
    importProgress((data) => {
      replaceDone(data.done)
      replaceInventory(data.inventory)
      replaceBuilt(data.hideout)
      replaceProgress(data.questProgress)
      replaceActive(data.active)
      replaceProfile(data.profile)
      replaceFavorites(data.favorites)
    })

  // Traders that actually run barters — the set the Profile lets you level.
  const barterTraders = useMemo(() => {
    const s = new Set(barters.map((b) => b.trader))
    return [...s].sort((a, b) => traderSortKey(a) - traderSortKey(b))
  }, [barters])

  const openBarter = useCallback((barter: Barter) => setTradeModal({ kind: 'barter', barter }), [])
  const openCraft = useCallback(
    (craft: Craft) =>
      setTradeModal({
        kind: 'craft',
        craft,
        stationLevel: levelByKey.get(stationLevelKey(craft.stationId, craft.level)),
      }),
    [levelByKey],
  )

  // Reverse index: item id → every quest/hideout/barter/craft that touches it.
  const itemUsage = useMemo(
    () => buildItemUsage(quests, stations, barters, crafts),
    [quests, stations, barters, crafts],
  )
  // Item modal cross-navigation closes itself then opens the target.
  const itemToQuest = useCallback((q: Quest) => {
    setItemModal(null)
    setDetailQuest(q)
  }, [])
  const itemToBarter = useCallback(
    (b: Barter) => {
      setItemModal(null)
      openBarter(b)
    },
    [openBarter],
  )
  const itemToCraft = useCallback(
    (c: Craft) => {
      setItemModal(null)
      openCraft(c)
    },
    [openCraft],
  )

  // Traders you haven't reached yet. Jaeger/Ref fall out of completed quests;
  // Lightkeeper has no unlock quest in the data, so the profile answers for him.
  const locked = useMemo(() => lockedTraders(quests, done, profile), [quests, done, profile])
  const autoUnlockedTraders = useMemo(() => questUnlockedTraders(quests, done), [quests, done])
  const unlockQuests = useMemo(
    () => Object.fromEntries(GATED_TRADERS.map((t) => [t, unlockQuestFor(quests, t)?.name ?? null])),
    [quests],
  )

  // The Arena questline is hidden entirely until the user opts in — you have to
  // "touch Arena" to see it. Locked traders' quests are hidden the same way, so
  // they can't surface in Best Quests before you can take them.
  const visibleQuests = useMemo(
    () =>
      quests.filter((q) => (filters.showArena || !q.arena) && !locked.has(q.trader)),
    [quests, filters.showArena, locked],
  )

  const allMaps = useMemo(() => {
    const s = new Set<string>()
    for (const q of visibleQuests) for (const m of q.maps) s.add(m)
    return [...s].sort((a, b) => mapSortKey(a) - mapSortKey(b))
  }, [visibleQuests])

  const allTraders = useMemo(() => {
    const s = new Set(visibleQuests.map((q) => q.trader))
    return [...s].sort((a, b) => traderSortKey(a) - traderSortKey(b))
  }, [visibleQuests])

  const filteredQuests = useMemo(() => {
    let list = visibleQuests.filter((q) => matchesAll(q, filters, { progress, done }))
    if (filters.hideDone) list = list.filter((q) => !done.has(q.id))
    if (filters.hideBlocked) list = list.filter((q) => !isBlocked(q, done))
    return list
  }, [visibleQuests, filters, done, progress])

  const doneCount = useMemo(
    () => visibleQuests.filter((q) => done.has(q.id)).length,
    [visibleQuests, done],
  )

  // Completed Arena quests are excluded from the count while the Arena toggle is
  // off — surface how many so the total doesn't look like it silently dropped.
  const hiddenArenaDone = useMemo(
    () => (filters.showArena ? 0 : quests.filter((q) => q.arena && done.has(q.id)).length),
    [quests, done, filters.showArena],
  )

  // Per-arc progress (done/total) for the questline badges.
  const seriesStats = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>()
    for (const q of visibleQuests) {
      if (!q.series) continue
      const s = m.get(q.series) ?? { total: 0, done: 0 }
      s.total++
      if (done.has(q.id)) s.done++
      m.set(q.series, s)
    }
    return m
  }, [visibleQuests, done])

  const best = useMemo(
    () => bestQuests(visibleQuests, done, progress, bestMaps, bestTraders, profile.pmcLevel),
    [visibleQuests, done, progress, bestMaps, bestTraders, profile.pmcLevel],
  )
  const bestRewards = useMemo(
    () => bestRewardQuests(visibleQuests, done, progress, bestMaps, bestTraders, profile.pmcLevel),
    [visibleQuests, done, progress, bestMaps, bestTraders, profile.pmcLevel],
  )

  // "What are we doing?" — roll a random quest from everything currently available
  // (not done, not blocked, and within the player's level).
  const rollRandomQuest = useCallback(() => {
    const lvl = profile.pmcLevel
    const available = visibleQuests.filter(
      (q) => !done.has(q.id) && !isBlocked(q, done) && (lvl <= 0 || q.minLevel <= lvl),
    )
    if (available.length === 0) return
    setDetailQuest(available[Math.floor(Math.random() * available.length)])
  }, [visibleQuests, done, profile.pmcLevel])

  const filterToSeries = useCallback((series: string) => {
    setFilters((f) => ({ ...f, search: series }))
    requestAnimationFrame(() => document.getElementById('by-quest')?.scrollIntoView())
  }, [])

  if (status === 'loading') {
    return <div className="app-state">Loading quest data from tarkov.dev…</div>
  }
  if (status === 'error') {
    return (
      <div className="app-state">
        <p>Couldn't reach the tarkov.dev API and no cached data is available.</p>
        <button className="clear-btn" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    )
  }

  const openQuestSection = (section: 'filters' | 'by-map' | 'by-progression' | 'by-quest') => {
    switchView('quests')
    if (section === 'by-map') setMapsOpen(true)
    if (section === 'by-progression') setTreeOpen(true)
    if (section === 'by-quest') setQuestsOpen(true)
    setSidebarOpen(false)
    // let the quests view render before jumping to the anchor
    requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView())
  }

  return (
    <div className="app-layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">Navigation</span>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">✕</button>
        </div>
        <ul className="sidebar-nav">
          {VIEWS.map((v) => (
            <li key={v.id}>
              <button
                className={`sidebar-view-link ${view === v.id ? 'active' : ''}`}
                onClick={() => {
                  switchView(v.id)
                  setSidebarOpen(false)
                }}
              >
                {v.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="sidebar-section">
          <span className="sidebar-label">Quest sections</span>
          <ul className="sidebar-nav sub">
            <li><button className="sidebar-view-link" onClick={() => openQuestSection('filters')}>Filters</button></li>
            <li><button className="sidebar-view-link" onClick={() => openQuestSection('by-map')}>By Map</button></li>
            <li><button className="sidebar-view-link" onClick={() => openQuestSection('by-progression')}>Progression</button></li>
            <li><button className="sidebar-view-link" onClick={() => openQuestSection('by-quest')}>By Quest</button></li>
          </ul>
        </div>
        <div className="sidebar-section">
          <span className="sidebar-label">Progress</span>
          <div className="sidebar-progress">
            {doneCount}/{visibleQuests.length} done
            {hiddenArenaDone > 0 && (
              <em className="arena-hidden-note" title="Completed Arena quests aren't counted until you enable the Arena (PvP) toggle.">
                {' '}+{hiddenArenaDone} Arena hidden
              </em>
            )}
          </div>
          <div className="sidebar-progress-bar">
            <div className="sidebar-progress-fill" style={{ width: `${visibleQuests.length ? (doneCount / visibleQuests.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="sidebar-section">
          <span className="sidebar-label">Data</span>
          <button className="sidebar-btn" onClick={saveProgress}>Save progress</button>
          <button className="sidebar-btn" onClick={loadProgress}>Load progress</button>
          <button className="sidebar-btn" onClick={() => void refresh()}>Refresh data</button>
        </div>
        <div className="sidebar-footer">
          {fetchedAt && (
            <>
              tarkov.dev · {timeAgo(fetchedAt)}
              {offline && <em className="offline"> · offline</em>}
              <br />
            </>
          )}
          by{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Nerd_Ginger
          </a>
        </div>
      </nav>

      <div className="app">
        <header>
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <span /><span /><span />
          </button>
          <h1>Tarkov Quest Tracker</h1>
          <nav className="view-tabs">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={`view-tab ${view === v.id ? 'active' : ''}`}
                onClick={() => switchView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </nav>
          <div className="header-meta">
            <span className="progress">
              {doneCount}/{visibleQuests.length} done
              {hiddenArenaDone > 0 && (
                <em
                  className="arena-hidden-note"
                  title="Completed Arena quests aren't counted until you enable the Arena (PvP) toggle."
                >
                  {' '}+{hiddenArenaDone} Arena hidden
                </em>
              )}
            </span>
            {fetchedAt && (
              <span className="freshness">
                data: tarkov.dev · {timeAgo(fetchedAt)}
                {questSource === 'json' && <BackupApiTag />}
                {offline && <em className="offline"> · offline, showing cached</em>}
              </span>
            )}
            <button className="clear-btn" onClick={saveProgress}>Save progress</button>
            <button className="clear-btn" onClick={loadProgress}>Load progress</button>
            <button className="clear-btn" onClick={() => void refresh()}>
              Refresh data
            </button>
          </div>
        </header>

        {view === 'best' && (
          <section>
            <h2>Best Quests</h2>
            <p className="legend">
              The quests you can do <strong>right now</strong>, ranked by how many missions they directly unblock.
              Track a quest's objectives (kills, collects) and a more-complete quest wins the tie. Can't decide?{' '}
              <button className="dice-btn" onClick={rollRandomQuest} title="Roll a random quest from everything currently available">
                🎲 Random quest
              </button>
            </p>
            <div className="filter-bar">
              <div className="filter-row">
                <span className="filter-label">Maps</span>
                <div className="chip-group">
                  {allMaps.map((m) => (
                    <button
                      key={m}
                      className={[
                        'chip',
                        bestMaps.has(m) ? 'active' : '',
                        isPseudoMap(m) ? 'pseudo' : '',
                        EVENT_MAPS.has(m) ? 'event' : '',
                      ].join(' ')}
                      onClick={() => toggleBestMap(m)}
                    >
                      {m}
                      {EVENT_MAPS.has(m) && <span className="event-tag">event</span>}
                    </button>
                  ))}
                  {bestMaps.size > 0 && (
                    <button className="clear-btn" onClick={() => setBestMaps(new Set())}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="filter-row">
                <span className="filter-label">Traders</span>
                <div className="chip-group">
                  {allTraders.map((t) => (
                    <button
                      key={t}
                      className={`chip ${bestTraders.has(t) ? 'active' : ''}`}
                      onClick={() => toggleBestTrader(t)}
                    >
                      {t}
                    </button>
                  ))}
                  {bestTraders.size > 0 && (
                    <button className="clear-btn" onClick={() => setBestTraders(new Set())}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
            <BestQuests
              best={best}
              rewards={bestRewards}
              done={done}
              onToggleDone={toggleQuest}
              onQuestClick={setDetailQuest}
              progress={progress}
              onSetProgress={setObjective}
              active={active}
            />
          </section>
        )}

        {view === 'quests' && (
          <>
            <div id="filters">
              <FilterBar filters={filters} onChange={setFilters} allMaps={allMaps} allTraders={allTraders} />
            </div>

            <section id="by-map">
              <h2 className="collapsible" onClick={() => setMapsOpen(!mapsOpen)}>
                <span className={`collapse-arrow ${mapsOpen ? 'open' : ''}`}>&#9654;</span>
                By map
              </h2>
              {mapsOpen && (
                <>
                  <p className="legend">
                    The last rows aren't real maps. <strong>Any map</strong> = truly anywhere (kills, find-in-raid).{' '}
                    <strong>Arena</strong> = Arena mode. <strong className="warn-text">Map unknown</strong> = tied to a place
                    the data didn't name — check the wiki. <strong>No raid needed</strong> = hand-ins &amp; builds.
                  </p>
                  <MapsSection
                    quests={visibleQuests}
                    filters={filters}
                    done={done}
                    progress={progress}
                    active={active}
                    onQuestClick={setDetailQuest}
                  />
                </>
              )}
            </section>

            <section id="by-progression">
              <h2 className="collapsible" onClick={() => setTreeOpen(!treeOpen)}>
                <span className={`collapse-arrow ${treeOpen ? 'open' : ''}`}>&#9654;</span>
                Quest Progression
              </h2>
              {treeOpen && (
                <QuestTree
                  quests={visibleQuests}
                  done={done}
                  onToggleDone={toggleQuest}
                  onQuestClick={setDetailQuest}
                />
              )}
            </section>

            <section id="by-quest">
              <h2 className="collapsible" onClick={() => setQuestsOpen(!questsOpen)}>
                <span className={`collapse-arrow ${questsOpen ? 'open' : ''}`}>&#9654;</span>
                Quests <span className="section-count">({filteredQuests.length})</span>
              </h2>
              {questsOpen && (
                <QuestsTable
                  quests={filteredQuests}
                  done={done}
                  active={active}
                  onToggleDone={toggleQuest}
                  onQuestClick={setDetailQuest}
                  seriesStats={seriesStats}
                  onSeriesClick={filterToSeries}
                />
              )}
            </section>
          </>
        )}

        {view === 'items' && (
          <section>
            <h2>Items needed</h2>
            <p className="legend">
              Everything outstanding across quests and hideout builds. Set <strong>Have</strong> to what's in your
              stash — completing a quest or build consumes its items automatically.
            </p>
            <ItemsView
              {...favProps}
              quests={visibleQuests}
              done={done}
              stations={stations}
              built={built}
              inventory={inventory}
              prices={pricesById}
              onSetCount={setCount}
              onQuestClick={setDetailQuest}
              onItemClick={setItemModal}
            />
          </section>
        )}

        {view === 'hideout' && (
          <HideoutView stations={stations} built={built} inventory={inventory} onToggleBuilt={toggleLevel} />
        )}

        {view === 'barters' && (
          <section>
            <h2>Barter</h2>
            <p className="legend">
              Every trader barter, bucketed by trader. The search covers all traders at once — several sell the
              same thing. <strong className="warn-text">FIR</strong> = the barter needs items banned from the flea
              market, so you'll have to find them in raid.
            </p>
            <BartersView
              {...favProps}
              barters={barters}
              profile={profile}
              done={done}
              traderResets={intel.traderResets}
              onOpen={openBarter}
            />
          </section>
        )}

        {view === 'profile' && (
          <section>
            <h2>Profile</h2>
            <p className="legend">
              Your character level and trader loyalty. These drive the Barter view's <strong>Can buy</strong>{' '}
              filter so it only shows what you actually have access to. Saved with your progress file.
            </p>
            <ProfileView
              profile={profile}
              traders={barterTraders}
              autoUnlocked={autoUnlockedTraders}
              unlockQuests={unlockQuests}
              onSetPmcLevel={setPmcLevel}
              onSetTraderLevel={setTraderLevel}
              onSetTraderUnlocked={setTraderUnlocked}
              onResetForWipe={resetForWipe}
            />
          </section>
        )}

        {view === 'crafts' && (
          <section>
            <h2>Crafts</h2>
            <p className="legend">
              Every hideout craft, bucketed by station. The search covers all stations at once.{' '}
              <strong className="warn-text">FIR</strong> = the craft needs flea-banned items — find them in raid.
              Flip <strong>Hideout tracking</strong> to hide recipes your tracked hideout can't make yet.
            </p>
            <CraftsView {...favProps} crafts={crafts} built={built} onOpen={openCraft} />
          </section>
        )}

        {view === 'firesale' && (
          <section>
            <h2>Fire Sale</h2>
            <p className="legend">
              Live PvE prices from tarkov.dev (refreshed ~hourly when online) — both sides of the market.{' '}
              <strong>Buy</strong> is the cheapest offer you can actually take at your trader loyalty (set it in
              Profile); 🔒 means a cheaper one sits above your level. <strong>Sell</strong> and{' '}
              <strong>₽/slot</strong> only count traders you've unlocked.{' '}
              <strong className="warn-text">✱</strong> = flea-banned, trader-only.
            </p>
            <FireSaleView
              {...favProps}
              rows={priceRows}
              profile={profile}
              locked={locked}
              traderResets={intel.traderResets}
              fetchedAt={pricesFetchedAt}
              source={pricesSource}
              loading={pricesLoading}
              offline={pricesOffline}
              onRefresh={() => void refreshPrices()}
              onItemClick={setItemModal}
            />
          </section>
        )}

        {view === 'keys' && (
          <section>
            <h2>Keys</h2>
            <p className="legend">
              Every key by the map it's used on, and what it opens (doors, trunks, containers). ⚡ means the lock
              needs power switched on. <strong>Value</strong> is the key's flea/trader price — a rough proxy for
              what's behind the door. <strong>🗺 map ↗</strong> opens the interactive map with every key location
              plotted; <strong>where + loot ↗</strong> is the wiki page with the exact spot and room contents.
            </p>
            <KeysView {...favProps} keys={keys} prices={pricesById} />
          </section>
        )}

        {view === 'bosses' && (
          <section>
            <h2>Bosses &amp; Goons</h2>
            <p className="legend">
              Live boss spawn odds and community Goon sightings from tarkov.dev (refreshed ~10 min when online).
            </p>
            <BossesView
              intel={intel}
              fetchedAt={intelFetchedAt}
              source={intelSource}
              loading={intelLoading}
              offline={intelOffline}
              onRefresh={() => void refreshIntel()}
            />
          </section>
        )}

        {view === 'ammo' && (
          <section>
            <h2>Ammo</h2>
            <p className="legend">
              Ballistics per round, grouped by caliber. <strong>C1–C6</strong> rate effectiveness against each
              armor class on a 1–5 scale (<strong>5</strong> = penetrates nearly every shot,{' '}
              <strong>3</strong> = gets through after chewing durability, <strong className="warn-text">1</strong> ={' '}
              don't bother) — estimated from pen power, so treat borderline cells as approximate. Click columns
              to sort, filter by caliber.
            </p>
            <AmmoView {...favProps} ammo={ammo} />
          </section>
        )}

        {view === 'stims' && (
          <section>
            <h2>Stims</h2>
            <p className="legend">
              Every injector, what the effect data says it's for, and what it pairs with. Click a row for the
              full effect list with timings (<strong>delay → end</strong>, relative to injection).{' '}
              <strong className="delta-up">Buffs</strong> and <strong className="warn-text">debuffs</strong> come
              from the sign of each effect's value; a <strong>·</strong> means the API ships no number and the
              effect's presence is the whole story. <strong>Role</strong> is derived from which effect types a
              stim applies — the first tag is a sorting key, not a recommendation, so check the others.{' '}
              <strong>⚠</strong> counts stims this actively cancels out. Every injector takes 2s to use, so that
              column is only there in case that ever changes. Pairings are effect-overlap maths on the API data —
              the game's own stacking rules aren't published, so treat them as a starting point. SJ9 is a fair
              example of the limits: its negative body temperature is the <em>point</em> in game (thermal
              masking), but sign-based classification can only read it as a downside.
            </p>
            <StimsView {...favProps} stims={stims} />
          </section>
        )}

        <QuestModal
          quest={detailQuest}
          done={done}
          onToggleDone={toggleQuest}
          onClose={() => setDetailQuest(null)}
          seriesStats={seriesStats}
          progress={progress}
          onSetProgress={setObjective}
          active={active}
          onToggleActive={activateQuest}
        />

        <TradeModal
          data={tradeModal}
          profile={profile}
          done={done}
          built={built}
          prices={pricesById}
          onClose={() => setTradeModal(null)}
        />

        <ItemModal
          item={itemModal}
          price={itemModal ? pricesById.get(itemModal.id) : undefined}
          usage={itemModal ? itemUsage.get(itemModal.id) : undefined}
          onClose={() => setItemModal(null)}
          onQuestClick={itemToQuest}
          onBarterClick={itemToBarter}
          onCraftClick={itemToCraft}
        />

        <footer className="app-footer">
          Built by{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Nerd_Ginger
          </a>{' '}
          · data from tarkov.dev ·{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            source on GitHub
          </a>{' '}
          ·{' '}
          <span className="app-version" title={__GIT_SHA__ ? `commit ${__GIT_SHA__}` : undefined}>
            v{__APP_VERSION__} · built {__BUILD_DATE__}
          </span>
        </footer>
      </div>
    </div>
  )
}
