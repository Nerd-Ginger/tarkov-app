import { useEffect } from 'react'
import type { Quest } from '../types'
import { EVENT_MAPS, PSEUDO_MAPS, isPseudoMap } from '../data/normalize'

interface Props {
  quest: Quest | null
  done: Set<string>
  onToggleDone: (id: string) => void
  onClose: () => void
}

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

export function QuestModal({ quest, done, onToggleDone, onClose }: Props) {
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <h3 className="modal-title">
          {quest.name}
          {quest.kappa && <span className="kappa-badge" title="Required for Kappa"> κ</span>}
        </h3>

        <div className="modal-meta">
          <span>{quest.trader}</span>
          <span>·</span>
          <span>Level {quest.minLevel}+</span>
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
                <span className={`badge cat-${o.category.replace(/[^a-zA-Z]/g, '')}`}>{o.category}</span>
                <span className="objective-text">
                  {o.description}
                  {o.optional && <em className="optional-tag"> (optional)</em>}
                </span>
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

        <div className="modal-footer">
          <label className="check-label">
            <input type="checkbox" checked={isDone} onChange={() => onToggleDone(quest.id)} />
            Mark done
          </label>
          <a className="wiki-link" href={quest.wikiLink} target="_blank" rel="noreferrer">
            Open wiki page ↗
          </a>
        </div>
      </div>
    </div>
  )
}
