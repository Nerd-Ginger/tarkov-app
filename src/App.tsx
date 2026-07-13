import { useCallback, useMemo, useState } from 'react'
import { AmmoView } from './components/AmmoView'
import { BestQuests } from './components/BestQuests'
import { bestQuests, bestRewardQuests } from './data/bestQuests'
import { FilterBar } from './components/FilterBar'
import { HideoutView } from './components/HideoutView'
import { ItemsView } from './components/ItemsView'
import { MapsSection } from './components/MapsSection'
import { QuestModal } from './components/QuestModal'
import { QuestTree } from './components/QuestTree'
import { QuestsTable } from './components/QuestsTable'
import { questHandInItems } from './data/items'
import { mapSortKey, traderSortKey } from './data/normalize'
import { exportProgress, importProgress } from './data/progressFile'
import { EMPTY_FILTERS, isBlocked, matchesAll } from './filters'
import type { Filters } from './filters'
import type { Quest } from './types'
import { useDone } from './hooks/useDone'
import { useHideout } from './hooks/useHideout'
import { useInventory } from './hooks/useInventory'
import { useQuestData } from './hooks/useQuestData'

type View = 'quests' | 'items' | 'hideout' | 'ammo'
const VIEW_KEY = 'tarkov.view.v1'
const VIEWS: { id: View; label: string }[] = [
  { id: 'quests', label: 'Quests' },
  { id: 'items', label: 'Items' },
  { id: 'hideout', label: 'Hideout' },
  { id: 'ammo', label: 'Ammo' },
]

function readView(): View {
  const v = localStorage.getItem(VIEW_KEY)
  return v === 'items' || v === 'hideout' || v === 'ammo' ? v : 'quests'
}

function timeAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

export default function App() {
  const { quests, stations, ammo, status, offline, fetchedAt, refresh } = useQuestData()
  const { done, toggle, replaceDone } = useDone()
  const { inventory, setCount, applyDeltas, replaceInventory } = useInventory()
  const { built, toggleBuilt, replaceBuilt } = useHideout()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [detailQuest, setDetailQuest] = useState<Quest | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mapsOpen, setMapsOpen] = useState(true)
  const [treeOpen, setTreeOpen] = useState(false)
  const [questsOpen, setQuestsOpen] = useState(true)
  const [bestOpen, setBestOpen] = useState(true)
  const [view, setView] = useState<View>(readView)

  const switchView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // fine — view just won't persist
    }
  }

  const questById = useMemo(() => new Map(quests.map((q) => [q.id, q])), [quests])
  const levelByKey = useMemo(() => new Map(stations.map((l) => [l.key, l])), [stations])

  // Completing a quest consumes its hand-in items from the inventory;
  // unchecking restores them. Same deal for hideout builds.
  const toggleQuest = useCallback(
    (id: string) => {
      const q = questById.get(id)
      if (q) applyDeltas(questHandInItems(q), done.has(id) ? 1 : -1)
      toggle(id)
    },
    [questById, done, applyDeltas, toggle],
  )

  const toggleLevel = useCallback(
    (key: string) => {
      const l = levelByKey.get(key)
      if (l) applyDeltas(l.items.map((r) => ({ item: r.item, count: r.count })), built.has(key) ? 1 : -1)
      toggleBuilt(key)
    },
    [levelByKey, built, applyDeltas, toggleBuilt],
  )

  const saveProgress = () => exportProgress(done, inventory, built)
  const loadProgress = () =>
    importProgress((data) => {
      replaceDone(data.done)
      replaceInventory(data.inventory)
      replaceBuilt(data.hideout)
    })

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

  const best = useMemo(() => bestQuests(visibleQuests, done), [visibleQuests, done])
  const bestRewards = useMemo(() => bestRewardQuests(visibleQuests, done), [visibleQuests, done])

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

  const openQuestSection = (section: 'filters' | 'best-quests' | 'by-map' | 'by-progression' | 'by-quest') => {
    switchView('quests')
    if (section === 'best-quests') setBestOpen(true)
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
            <li><button className="sidebar-view-link" onClick={() => openQuestSection('best-quests')}>Best Quests</button></li>
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
        {fetchedAt && (
          <div className="sidebar-footer">
            tarkov.dev · {timeAgo(fetchedAt)}
            {offline && <em className="offline"> · offline</em>}
          </div>
        )}
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

        {view === 'quests' && (
          <>
            <div id="filters">
              <FilterBar filters={filters} onChange={setFilters} allMaps={allMaps} allTraders={allTraders} />
            </div>

            <section id="best-quests">
              <h2 className="collapsible" onClick={() => setBestOpen(!bestOpen)}>
                <span className={`collapse-arrow ${bestOpen ? 'open' : ''}`}>&#9654;</span>
                Best Quests
              </h2>
              {bestOpen && (
                <>
                  <p className="legend">
                    The quests you can do <strong>right now</strong> that unblock the most of the remaining tree —
                    knock these out to open up the most new missions.
                  </p>
                  <BestQuests
                    best={best}
                    rewards={bestRewards}
                    done={done}
                    onToggleDone={toggleQuest}
                    onQuestClick={setDetailQuest}
                  />
                </>
              )}
            </section>

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
              onSetCount={setCount}
              onQuestClick={setDetailQuest}
            />
          </section>
        )}

        {view === 'hideout' && (
          <HideoutView stations={stations} built={built} inventory={inventory} onToggleBuilt={toggleLevel} />
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
        />
      </div>
    </div>
  )
}
