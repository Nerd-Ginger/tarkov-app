import type { TradeItem } from '../types'

/** "requires in-raid finds" marker for barters/crafts with flea-banned inputs. */
export function FirBadge() {
  return (
    <span className="fir-badge" title="Needs items banned from the flea market — find them in raid (or barter/craft them)">
      FIR
    </span>
  )
}

/** Item list for a trade side; flea-banned items get the warn treatment. */
export function TradeList({ items }: { items: TradeItem[] }) {
  return (
    <ul className="trade-items">
      {items.map((t, i) => (
        <li key={i} className={t.noFlea ? 'no-flea' : ''} title={t.noFlea ? 'Banned from flea market — find in raid' : undefined}>
          {t.count > 1 && <span className="trade-count">{t.count.toLocaleString()}×</span>} {t.item.name}
          {t.noFlea && <span className="no-flea-mark">✱</span>}
        </li>
      ))}
    </ul>
  )
}
