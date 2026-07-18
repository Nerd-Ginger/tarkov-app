import { useState } from 'react'
import type { Quest } from '../types'
import type { BestQuest, RewardQuest } from '../data/bestQuests'
import { EVENT_MAPS, PSEUDO_MAPS, isPseudoMap } from '../data/normalize'
import { isTrackable, questProgress } from '../data/progress'
import type { QuestProgress } from '../hooks/useQuestProgress'
import { LightkeeperMark } from './LightkeeperMark'
import { ObjectiveCheck } from './ObjectiveCheck'
import { ObjectiveStepper } from './ObjectiveStepper'

interface Props {
  best: BestQuest[]
  rewards: RewardQuest[]
  done: Set<string>
  active: Set<string>
  onToggleDone: (id: string) => void
  onQuestClick: (quest: Quest) => void
  progress: QuestProgress
  onSetProgress: (objectiveId: string, value: number) => void
}

const ROUBLES_ID = '5449016a4bdc2d6f028b456f'

function MapBadges({ quest }: { quest: Quest }) {
  return (
    <div className="best-section">
      <span className="best-label">Maps</span>
      <div className="badge-group">
        {quest.maps.map((m) => {
          const pseudo = PSEUDO_MAPS[m]
          return (
            <span
              key={m}
              title={pseudo?.blurb}
              className={[
                'badge map-badge',
                isPseudoMap(m) ? 'pseudo' : '',
                pseudo?.tone === 'warn' ? 'warn' : '',
                EVENT_MAPS.has(m) ? 'event' : '',
              ].join(' ')}
            >
              {m}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function Card({ quest: q, rank, highlight, children, done, active, onToggleDone, onQuestClick }: {
  quest: Quest
  rank: number
  highlight: React.ReactNode
  children: React.ReactNode
  done: Set<string>
  active: Set<string>
  onToggleDone: (id: string) => void
  onQuestClick: (quest: Quest) => void
}) {
  return (
    <div className={`best-card ${active.has(q.id) ? 'is-active' : ''}`}>
      <div className="best-rank">#{rank}</div>
      <div className="best-head">
        <button className="quest-link best-name" onClick={() => onQuestClick(q)} title="Click for details">
          {q.name}
        </button>
        {q.kappa && <span className="kappa-badge">κ</span>}
        <LightkeeperMark quest={q} />
        {active.has(q.id) && (
          <span className="active-badge" title="You're currently on this quest">▶ Active</span>
        )}
      </div>
      <div className="best-meta">
        {q.trader} · Lv {q.minLevel}
      </div>
      {highlight}
      {children}
      <MapBadges quest={q} />
      <label className="check-label best-done">
        <input type="checkbox" checked={done.has(q.id)} onChange={() => onToggleDone(q.id)} />
        Mark done
      </label>
    </div>
  )
}

export function BestQuests({ best, rewards, done, active, onToggleDone, onQuestClick, progress, onSetProgress }: Props) {
  const cardProps = { done, active, onToggleDone, onQuestClick }
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Active quests float to the top, but keep their real rank number so the
  // ordering they earned is still visible.
  const activeFirst = <T extends { quest: { id: string } }>(list: T[]) =>
    list
      .map((item, i) => ({ item, rank: i + 1 }))
      .sort((a, b) => Number(active.has(b.item.quest.id)) - Number(active.has(a.item.quest.id)))
  const bestOrdered = activeFirst(best)
  const rewardsOrdered = activeFirst(rewards)

  return (
    <div className="best-groups">
      <div>
        <h3 className="best-group-title">Most unblocked</h3>
        {best.length === 0 ? (
          <p className="empty-note">Nothing left to unblock — every remaining quest is already available.</p>
        ) : (
          <div className="best-grid">
            {bestOrdered.map(({ item: { quest: q, unblocks, unlocked, chainTotal }, rank }) => (
              <Card
                key={q.id}
                quest={q}
                rank={rank}
                highlight={
                  <div>
                    <button
                      className={`best-unblocks unlock-toggle ${expandedId === q.id ? 'open' : ''}`}
                      title="Next tier = quests this directly unblocks (click to list them). Chain = everything waiting further down the tree."
                      onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                    >
                      unblocks <strong>{unblocks}</strong> next{' '}
                      <span className="chain-total">· {chainTotal} in chain</span>{' '}
                      <span className={`collapse-arrow ${expandedId === q.id ? 'open' : ''}`}>&#9654;</span>
                    </button>
                    {expandedId === q.id && (
                      <ul className="unlock-list">
                        {unlocked.map((u) => (
                          <li key={u.id}>
                            <button className="quest-chip" onClick={() => onQuestClick(u)}>
                              {u.name}
                            </button>
                            <span className="unlock-meta">
                              {u.trader} · {u.minLevel}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                }
                {...cardProps}
              >
                {(() => {
                  const p = questProgress(q, progress)
                  if (!p.active) return null
                  return (
                    <div className="best-progressbar" title={`${p.have} of ${p.target} tracked`}>
                      <div className="best-progressbar-fill" style={{ width: `${p.fraction * 100}%` }} />
                      <span className="best-progressbar-label">{Math.round(p.fraction * 100)}%</span>
                    </div>
                  )
                })()}
                <div className="best-section">
                  <span className="best-label">Requirements</span>
                  <ul className="best-reqs">
                    {q.objectives
                      .filter((o) => !o.optional)
                      .slice(0, 4)
                      .map((o, j) => (
                        <li key={j}>
                          <ObjectiveCheck
                            objective={o}
                            value={progress[o.id] ?? 0}
                            questDone={done.has(q.id)}
                            onChange={onSetProgress}
                          />
                          <span className={`badge cat-${o.category.replace(/[^a-zA-Z]/g, '')}`}>{o.category}</span>
                          <span className="best-req-text">{o.description}</span>
                          {isTrackable(o) && (
                            <ObjectiveStepper
                              objective={o}
                              value={progress[o.id] ?? 0}
                              questDone={done.has(q.id)}
                              onChange={onSetProgress}
                            />
                          )}
                        </li>
                      ))}
                    {q.objectives.filter((o) => !o.optional).length > 4 && (
                      <li className="best-more">
                        …and {q.objectives.filter((o) => !o.optional).length - 4} more — click the name
                      </li>
                    )}
                  </ul>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="best-group-title">Best rewards</h3>
        {rewards.length === 0 ? (
          <p className="empty-note">No available quests to rank.</p>
        ) : (
          <div className="best-grid">
            {rewardsOrdered.map(({ item: { quest: q, xp, roubles }, rank }) => (
              <Card
                key={q.id}
                quest={q}
                rank={rank}
                highlight={
                  <div className="best-xp" title="Completion XP · roubles reward">
                    <strong>{xp.toLocaleString()}</strong> XP
                    {roubles > 0 && <span className="best-roubles"> · ₽{roubles.toLocaleString()}</span>}
                  </div>
                }
                {...cardProps}
              >
                <div className="best-section">
                  <span className="best-label">Rewards</span>
                  <ul className="best-reqs">
                    {q.rewardItems
                      .filter((r) => r.item.id !== ROUBLES_ID)
                      .slice(0, 4)
                      .map((r, j) => (
                        <li key={j}>
                          <span className="best-req-text">
                            {r.count > 1 ? `${r.count}× ` : ''}
                            {r.item.name}
                          </span>
                        </li>
                      ))}
                    {q.rewardStanding.map((s, j) => (
                      <li key={`s${j}`}>
                        <span className="best-req-text best-standing">
                          {s.trader} rep {s.standing > 0 ? '+' : ''}
                          {s.standing}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
