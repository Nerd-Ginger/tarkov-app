import type { Quest } from '../types'
import { EVENT_MAPS, PSEUDO_MAPS, isPseudoMap } from '../data/normalize'

interface Props {
  quests: Quest[]
  done: Set<string>
  onToggleDone: (id: string) => void
  highlightId: string | null
}

export function QuestsTable({ quests, done, onToggleDone, highlightId }: Props) {
  if (quests.length === 0) return <p className="empty-note">No quests match the current filters.</p>

  return (
    <table className="quests-table">
      <thead>
        <tr>
          <th className="done-col">✓</th>
          <th>Quest</th>
          <th>Trader</th>
          <th className="level-col">Lv</th>
          <th className="kappa-col">κ</th>
          <th>Objectives</th>
          <th>Maps</th>
        </tr>
      </thead>
      <tbody>
        {quests.map((q) => {
          const isDone = done.has(q.id)
          const objectiveSummary = q.objectives
            .map((o) => `• ${o.description}${o.optional ? ' (optional)' : ''}`)
            .join('\n')
          return (
            <tr
              key={q.id}
              id={`quest-row-${q.id}`}
              className={[isDone ? 'done' : '', highlightId === q.id ? 'highlight' : ''].join(' ')}
            >
              <td className="done-col">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => onToggleDone(q.id)}
                  aria-label={`Mark ${q.name} done`}
                />
              </td>
              <td className="quest-name" title={objectiveSummary}>
                <a href={q.wikiLink} target="_blank" rel="noreferrer">
                  {q.name}
                </a>
              </td>
              <td>{q.trader}</td>
              <td className="level-col">{q.minLevel}</td>
              <td className="kappa-col">{q.kappa && <span className="kappa-badge">κ</span>}</td>
              <td>
                <div className="badge-group">
                  {q.categories.map((c) => (
                    <span key={c} className={`badge cat-${c.replace(/[^a-zA-Z]/g, '')}`}>
                      {c}
                    </span>
                  ))}
                </div>
              </td>
              <td>
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
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
