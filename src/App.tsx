/**
 * Tarkov Quest Tracker
 * Author: Nerd_Ginger — https://github.com/Nerd-Ginger/tarkov-app
 * Quest & item data from the tarkov.dev API.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AmmoView } from './components/AmmoView'
import { BossesView } from './components/BossesView'
import { FireSaleView } from './components/FireSaleView'
import { ItemModal } from './components/ItemModal'
import { BartersView } from './components/BartersView'
import { BestQuests } from './components/BestQuests'
import { CraftsView } from './components/CraftsView'
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
import { mapSortKey, stationLevelKey, traderSortKey } from './data/normalize'
import { exportProgress, importProgress } from './data/progressFile'
import { EMPTY_FILTERS, isBlocked, matchesAll } from './filters'
import type { Filters } from './filters'
import type { Barter, Craft, ItemRef, Quest } from './types'
import { useActive } from './hooks/useActive'
import { useDone } from './hooks/useDone'
import { useHideout } from './hooks/useHideout'
import { useInventory } from './hooks/useInventory'
import { useIntel } from './hooks/useIntel'
import { usePrices } from './hooks/usePrices'
import { useProfile } from './hooks/useProfile'
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
  | 'bosses'
  | 'ammo'
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
  { id: 'bosses', label: 'Bosses' },
  { id: 'ammo', label: 'Ammo' },
  { id: 'profile', label: 'Profile' },
]

const OTHER_VIEWS = new Set<string>([
  'best',
  'items',
  'hideout',
  'barters',
  'crafts',
  'firesale',
  'bosses',
  'ammo',
  'profile',
])

/** Views that show flea prices — visiting one triggers the lazy price fetch. */
const PRICE_VIEWS = new Set<View>(['items', 'barters', 'crafts', 'firesale'])
/** Views that need trader-reset / goon / boss intel. */
const INTEL_VIEWS = new Set<View>(['barters', 'bosses'])

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
  const { quests, stations, ammo, barters, crafts, status, offline, fetchedAt, refresh } = useQuestData()
  const { done, toggle, replaceDone } = useDone()
  const { inventory, setCount, applyDeltas, replaceInventory } = useInventory()
  const { built, toggleBuilt, replaceBuilt } = useHideout()
  const { progress, setObjective, replaceProgress } = useQuestProgress()
  const { active, toggleActive, clearActive, replaceActive } = useActive()
  const { profile, setPmcLevel, setTraderLevel, replaceProfile } = useProfile()
  const {
    rows: priceRows,
    byId: pricesById,
    fetchedAt: pricesFetchedAt,
    loading: pricesLoading,
    offline: pricesOffline,
    ensureFresh: ensureFreshPrices,
    refresh: refreshPrices,
  } = usePrices()
  const {
    intel,
    fetchedAt: intelFetchedAt,
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
  const [view, setView] = useState<View>(readView)

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
        if (newlyDone.length > 0) replaceDone([...done, ...newlyDone])
      }
      toggleActive(id)
    },
    [active, questById, done, replaceDone, toggleActive],
  )

  const toggleLevel = useCallback(
    (key: string) => {
      const l = levelByKey.get(key)
      if (l) applyDeltas(l.items.map((r) => ({ item: r.item, count: r.count })), built.has(key) ? 1 : -1)
      toggleBuilt(key)
    },
    [levelByKey, built, applyDeltas, toggleBuilt],
  )

  const saveProgress = () => exportProgress(done, inventory, built, progress, active, profile)
  const loadProgress = () =>
    importProgress((data) => {
      replaceDone(data.done)
      replaceInventory(data.inventory)
      replaceBuilt(data.hideout)
      replaceProgress(data.questProgress)
      replaceActive(data.active)
      replaceProfile(data.profile)
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

  // The Arena questline is hidden entirely until the user opts in — you have to
  // "touch Arena" to see it. Everything below is derived from this gated list.
  const visibleQuests = useMemo(
    () => (filters.showArena ? quests : quests.filter((q) => !q.arena)),
    [quests, filters.showArena],
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
    let list = visibleQuests.filter((q) => matchesAll(q, filters))
    if (filters.hideDone) list = list.filter((q) => !done.has(q.id))
    if (filters.hideBlocked) list = list.filter((q) => !isBlocked(q, done))
    return list
  }, [visibleQuests, filters, done])

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

  const best = useMemo(() => bestQuests(visibleQuests, done, progress), [visibleQuests, done, progress])
  const bestRewards = useMemo(() => bestRewardQuests(visibleQuests, done), [visibleQuests, done])

  // "What are we doing?" — roll a random quest from everything currently available.
  const rollRandomQuest = useCallback(() => {
    const available = visibleQuests.filter((q) => !done.has(q.id) && !isBlocked(q, done))
    if (available.length === 0) return
    setDetailQuest(available[Math.floor(Math.random() * available.length)])
  }, [visibleQuests, done])

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
                  <MapsSection quests={visibleQuests} filters={filters} done={done} onQuestClick={setDetailQuest} />
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
              onSetPmcLevel={setPmcLevel}
              onSetTraderLevel={setTraderLevel}
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
            <CraftsView crafts={crafts} built={built} onOpen={openCraft} />
          </section>
        )}

        {view === 'firesale' && (
          <section>
            <h2>Fire Sale</h2>
            <p className="legend">
              Live PvE prices from tarkov.dev (refreshed ~hourly when online). <strong>Sell to</strong> = who pays
              more for the item; trader prices are the best trader, in roubles.{' '}
              <strong className="warn-text">✱</strong> = flea-banned, trader-only.
            </p>
            <FireSaleView
              rows={priceRows}
              fetchedAt={pricesFetchedAt}
              loading={pricesLoading}
              offline={pricesOffline}
              onRefresh={() => void refreshPrices()}
              onItemClick={setItemModal}
            />
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
            <AmmoView ammo={ammo} />
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
          </a>
        </footer>
      </div>
    </div>
  )
}
