import type { PriceRow, TradeItem } from '../types'

/** "requires in-raid finds" marker for barters/crafts with flea-banned inputs. */
export function FirBadge() {
  return (
    <span className="fir-badge" title="Needs items banned from the flea market — find them in raid (or barter/craft them)">
      FIR
    </span>
  )
}

/** Item list for a trade side; flea-banned items get the warn treatment. Pass `prices` to append unit flea prices. */
export function TradeList({ items, prices }: { items: TradeItem[]; prices?: Map<string, PriceRow> }) {
  return (
    <ul className="trade-items">
      {items.map((t, i) => {
        const p = prices?.get(t.item.id)
        return (
          <li key={i} className={t.noFlea ? 'no-flea' : ''} title={t.noFlea ? 'Banned from flea market — find in raid' : undefined}>
            {t.count > 1 && <span className="trade-count">{t.count.toLocaleString()}×</span>} {t.item.name}
            {t.noFlea && <span className="no-flea-mark">✱</span>}
            {p?.flea != null && p.flea > 1 && (
              <span className="unit-price"> ₽{Math.round(p.flea).toLocaleString()} ea.</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
