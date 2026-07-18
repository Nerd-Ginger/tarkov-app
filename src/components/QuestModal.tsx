import { useEffect } from 'react'
import type { Quest } from '../types'
import { ROUBLES_ID } from '../api/prices'
import { EVENT_MAPS, PSEUDO_MAPS, isPseudoMap } from '../data/normalize'
import { isCheckable, isTrackable } from '../data/progress'
import type { QuestProgress } from '../hooks/useQuestProgress'
import { LightkeeperMark } from './LightkeeperMark'
import { ObjectiveCheck } from './ObjectiveCheck'
import { ObjectiveStepper } from './ObjectiveStepper'

interface Props {
  quest: Quest | null
  done: Set<string>
  onToggleDone: (id: string) => void
  onClose: () => void
  seriesStats: Map<string, { total: number; done: number }>
  progress: QuestProgress
  onSetProgress: (objectiveId: string, value: number) => void
  active: Set<string>
  onToggleActive: (id: string) => void
}

const fmt = (n: number) => n.toLocaleString('en-US')

function MapBadge({ name }: { name: string }) {
  const pseudo = PSEUDO_MAPS[name]
  return (
    <span
      title={pseudo?.blurb}
      className={[
        'badge map-badge',
        isPseudoMap(name) ? 'pseudo' : '',
        pseudo?.tone === 'warn' ? 'warn' : '',
        EVENT_MAPS.has(name) ? 'event' : '',
      ].join(' ')}
    >
      {name}
    </span>
  )
}

export function QuestModal({
  quest,
  done,
  onToggleDone,
  onClose,
  seriesStats,
  progress,
  onSetProgress,
  active,
  onToggleActive,
}: Props) {
  useEffect(() => {
    if (!quest) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quest, onClose])

  if (!quest) return null
  const isDone = done.has(quest.id)

  // Roubles are just another reward item — pull them out as the headline payout.
  const roubles = quest.rewardItems.find((r) => r.item.id === ROUBLES_ID)?.count ?? 0
  const items = quest.rewardItems.filter((r) => r.item.id !== ROUBLES_ID)
  const hasUnlocks =
    quest.rewardTraderUnlocks.length > 0 || quest.rewardOffers.length > 0 || quest.rewardSkills.length > 0
  const hasRewards =
    quest.xp > 0 || roubles > 0 || items.length > 0 || quest.rewardStanding.length > 0 || hasUnlocks

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <h3 className="modal-title">
          {quest.name}
          {quest.kappa && <span className="kappa-badge" title="Required for Kappa"> κ</span>}
          {' '}
          <LightkeeperMark quest={quest} />
        </h3>

        <div className="modal-meta">
          <span>{quest.trader}</span>
          <span>·</span>
          <span>Level {quest.minLevel}+</span>
          {quest.series && seriesStats.has(quest.series) && (
            <>
              <span>·</span>
              <span className="series-tag">
                {quest.series} arc {seriesStats.get(quest.series)!.done}/{seriesStats.get(quest.series)!.total}
              </span>
            </>
          )}
        </div>

        <div className="modal-section">
          <span className="modal-label">Maps</span>
          <div className="badge-group">
            {quest.maps.map((m) => (
              <MapBadge key={m} name={m} />
            ))}
          </div>
        </div>

        <div className="modal-section">
          <span className="modal-label">Objectives</span>
          <ul className="objective-list">
            {quest.objectives.map((o, i) => (
              <li key={i} className={o.optional ? 'optional' : ''}>
                {isCheckable(o) ? (
                  <ObjectiveCheck
                    objective={o}
                    value={progress[o.id] ?? 0}
                    questDone={isDone}
                    onChange={onSetProgress}
                  />
                ) : (
                  <span className="obj-check-spacer" />
                )}
                <span className={`badge cat-${o.category.replace(/[^a-zA-Z]/g, '')}`}>{o.category}</span>
                <span className="objective-text">
                  {o.description}
                  {o.optional && <em className="optional-tag"> (optional)</em>}
                </span>
                {isTrackable(o) && (
                  <div className="objective-progress">
                    <ObjectiveStepper
                      objective={o}
                      value={progress[o.id] ?? 0}
                      questDone={isDone}
                      onChange={onSetProgress}
                    />
                  </div>
                )}
                {o.maps.length > 0 && (
                  <div className="objective-maps">
                    {o.maps.map((m) => (
                      <MapBadge key={m} name={m} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {hasRewards && (
          <div className="modal-section">
            <span className="modal-label">Rewards</span>
            <div className="reward-headline">
              {quest.xp > 0 && <span className="reward-xp">{fmt(quest.xp)} XP</span>}
              {roubles > 0 && <span className="reward-money">₽{fmt(roubles)}</span>}
              {quest.rewardStanding.map((s) => (
                <span key={s.trader} className={`reward-rep ${s.standing < 0 ? 'neg' : ''}`}>
                  {s.standing > 0 ? '+' : ''}
                  {s.standing.toFixed(2)} {s.trader}
                </span>
              ))}
            </div>

            {items.length > 0 && (
              <div className="badge-group reward-items">
                {items.map((r) => (
                  <span key={r.item.id} className="badge reward-item">
                    {r.count > 1 && <span className="trade-count">{fmt(r.count)}×</span>} {r.item.name}
                  </span>
                ))}
              </div>
            )}

            {hasUnlocks && (
              <ul className="unlock-rewards">
                {quest.rewardTraderUnlocks.map((t) => (
                  <li key={t}>
                    <span className="unlock-tag trader">Unlocks trader</span> {t}
                  </li>
                ))}
                {quest.rewardOffers.map((o) => (
                  <li key={o.item.id}>
                    <span className="unlock-tag">Unlocks barter</span> {o.item.name}
                    <span className="unlock-src">
                      {' '}
                      — {o.trader} LL{o.level}
                    </span>
                  </li>
                ))}
                {quest.rewardSkills.map((s) => (
                  <li key={s.name}>
                    <span className="unlock-tag skill">Skill</span> {s.name} +{s.level}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="modal-footer">
          <label className="check-label">
            <input type="checkbox" checked={isDone} onChange={() => onToggleDone(quest.id)} />
            Mark done
          </label>
          {!isDone && (
            <label
              className={`check-label active-toggle ${active.has(quest.id) ? 'on' : ''}`}
              title="Mark this as the quest you're currently on — every prerequisite before it gets marked done automatically (inventory untouched)."
            >
              <input type="checkbox" checked={active.has(quest.id)} onChange={() => onToggleActive(quest.id)} />
              ▶ Active
            </label>
          )}
          <a className="wiki-link" href={quest.wikiLink} target="_blank" rel="noreferrer">
            Open wiki page ↗
          </a>
        </div>
      </div>
    </div>
  )
}
