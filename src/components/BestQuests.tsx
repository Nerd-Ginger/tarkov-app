import type { Quest } from '../types'
import type { BestQuest } from '../data/bestQuests'
import { EVENT_MAPS, PSEUDO_MAPS, isPseudoMap } from '../data/normalize'
import { LightkeeperMark } from './LightkeeperMark'

interface Props {
  best: BestQuest[]
  done: Set<string>
  onToggleDone: (id: string) => void
  onQuestClick: (quest: Quest) => void
}

export function BestQuests({ best, done, onToggleDone, onQuestClick }: Props) {
  if (best.length === 0) {
    return <p className="empty-note">Nothing left to unblock — every remaining quest is already available.</p>
  }

  return (
    <div className="best-grid">
      {best.map(({ quest: q, unblocks }, i) => (
        <div key={q.id} className="best-card">
          <div className="best-rank">#{i + 1}</div>
          <div className="best-head">
            <button className="quest-link best-name" onClick={() => onQuestClick(q)} title="Click for details">
              {q.name}
            </button>
            {q.kappa && <span className="kappa-badge">κ</span>}
            <LightkeeperMark quest={q} />
          </div>
          <div className="best-meta">
            {q.trader} · Lv {q.minLevel}
          </div>
          <div className="best-unblocks" title="Not-yet-done quests waiting behind this one (directly or down the chain)">
            unblocks <strong>{unblocks}</strong> quest{unblocks === 1 ? '' : 's'}
          </div>
          <div className="best-section">
            <span className="best-label">Requirements</span>
            <ul className="best-reqs">
              {q.objectives
                .filter((o) => !o.optional)
                .slice(0, 4)
                .map((o, j) => (
                  <li key={j}>
                    <span className={`badge cat-${o.category.replace(/[^a-zA-Z]/g, '')}`}>{o.category}</span>
                    <span className="best-req-text">{o.description}</span>
                  </li>
                ))}
              {q.objectives.filter((o) => !o.optional).length > 4 && (
                <li className="best-more">…and {q.objectives.filter((o) => !o.optional).length - 4} more — click the name</li>
              )}
            </ul>
          </div>
          <div className="best-section">
            <span className="best-label">Maps</span>
            <div className="badge-group">
              {q.maps.map((m) => {
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
          <label className="check-label best-done">
            <input type="checkbox" checked={done.has(q.id)} onChange={() => onToggleDone(q.id)} />
            Mark done
          </label>
        </div>
      ))}
    </div>
  )
}
