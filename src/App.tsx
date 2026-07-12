import { useMemo, useState } from 'react'
import { FilterBar } from './components/FilterBar'
import { MapsSection } from './components/MapsSection'
import { QuestModal } from './components/QuestModal'
import { QuestsTable } from './components/QuestsTable'
import { mapSortKey, traderSortKey } from './data/normalize'
import { EMPTY_FILTERS, matchesAll } from './filters'
import type { Filters } from './filters'
import type { Quest } from './types'
import { useDone } from './hooks/useDone'
import { useQuestData } from './hooks/useQuestData'

function timeAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

export default function App() {
  const { quests, status, offline, fetchedAt, refresh } = useQuestData()
  const { done, toggle } = useDone()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [detailQuest, setDetailQuest] = useState<Quest | null>(null)

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
    return list
  }, [visibleQuests, filters, done])

  const doneCount = useMemo(
    () => visibleQuests.filter((q) => done.has(q.id)).length,
    [visibleQuests, done],
  )

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

  return (
    <div className="app">
      <header>
        <h1>Tarkov Quest Tracker</h1>
        <div className="header-meta">
          <span className="progress">
            {doneCount}/{visibleQuests.length} done
          </span>
          {fetchedAt && (
            <span className="freshness">
              data: tarkov.dev · {timeAgo(fetchedAt)}
              {offline && <em className="offline"> · offline, showing cached</em>}
            </span>
          )}
          <button className="clear-btn" onClick={() => void refresh()}>
            Refresh data
          </button>
        </div>
      </header>

      <FilterBar filters={filters} onChange={setFilters} allMaps={allMaps} allTraders={allTraders} />

      <section>
        <h2>By map</h2>
        <p className="legend">
          The last rows aren't real maps. <strong>Any map</strong> = truly anywhere (kills, find-in-raid).{' '}
          <strong>Arena</strong> = Arena mode. <strong className="warn-text">Map unknown</strong> = tied to a place
          the data didn't name — check the wiki. <strong>No raid needed</strong> = hand-ins &amp; builds.
        </p>
        <MapsSection quests={visibleQuests} filters={filters} done={done} onQuestClick={setDetailQuest} />
      </section>

      <section>
        <h2>
          Quests <span className="section-count">({filteredQuests.length})</span>
        </h2>
        <QuestsTable
          quests={filteredQuests}
          done={done}
          onToggleDone={toggle}
          onQuestClick={setDetailQuest}
        />
      </section>

      <QuestModal
        quest={detailQuest}
        done={done}
        onToggleDone={toggle}
        onClose={() => setDetailQuest(null)}
      />
    </div>
  )
}
