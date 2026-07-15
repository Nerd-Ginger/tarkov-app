import { useEffect } from 'react'
import type { Barter, Craft, ItemRef, PriceRow, Quest } from '../types'
import type { ItemUsage } from '../data/itemUsage'

interface Props {
  item: ItemRef | null
  price: PriceRow | undefined
  usage: ItemUsage | undefined
  onClose: () => void
  onQuestClick: (quest: Quest) => void
  onBarterClick: (barter: Barter) => void
  onCraftClick: (craft: Craft) => void
}

const rub = (n: number) => `₽${Math.round(n).toLocaleString()}`

function rewardName(items: { item: ItemRef; count: number }[]): string {
  const r = items[0]
  if (!r) return 'trade'
  return `${r.count > 1 ? `${r.count}× ` : ''}${r.item.shortName}`
}

export function ItemModal({ item, price, usage, onClose, onQuestClick, onBarterClick, onCraftClick }: Props) {
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  if (!item) return null
  const u = usage
  const nothing =
    !u ||
    (u.quests.length === 0 &&
      u.stations.length === 0 &&
      u.barterInputs.length === 0 &&
      u.barterOutputs.length === 0 &&
      u.craftInputs.length === 0 &&
      u.craftOutputs.length === 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <h3 className="modal-title">{item.name}</h3>

        {price ? (
          <div className="item-prices">
            <div className="item-price-cell">
              <span className="ip-label">Flea avg</span>
              <span className="ip-val">{price.flea != null ? rub(price.flea) : '—'}</span>
            </div>
            <div className="item-price-cell">
              <span className="ip-label">Best trader</span>
              <span className="ip-val">
                {price.trader > 0 ? rub(price.trader) : '—'}
                {price.traderName && <span className="trader-src"> {price.traderName}</span>}
              </span>
            </div>
            <div className="item-price-cell">
              <span className="ip-label">₽/slot</span>
              <span className="ip-val">
                {rub(Math.max(price.flea ?? 0, price.trader) / price.slots)}
                {price.slots > 1 && <span className="trader-src"> ({price.slots} slot)</span>}
              </span>
            </div>
            <div className="item-price-cell">
              <span className="ip-label">48h</span>
              <span
                className={`ip-val ${price.change48h && price.change48h > 0 ? 'delta-up' : price.change48h && price.change48h < 0 ? 'delta-down' : ''}`}
              >
                {price.change48h == null ? '—' : `${price.change48h > 0 ? '+' : ''}${price.change48h}%`}
              </span>
            </div>
          </div>
        ) : (
          <p className="modal-meta">No market price (flea-banned or prices not loaded).</p>
        )}

        {price && price.buyFrom.length > 0 && (
          <div className="modal-section">
            <span className="modal-label">Buy from</span>
            <ul className="buy-list">
              {price.buyFrom.map((b, i) => (
                <li key={i}>
                  <span className="buy-src">
                    {b.source}
                    {b.minLevel > 0 && <span className="buy-ll"> LL{b.minLevel}</span>}
                  </span>
                  <span className="buy-price">{rub(b.price)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {nothing ? (
          <p className="empty-note">Not used by any tracked quest, hideout build, barter, or craft.</p>
        ) : (
          <>
            {u!.quests.length > 0 && (
              <div className="modal-section">
                <span className="modal-label">Needed by quests</span>
                <div className="quest-chips">
                  {u!.quests.map(({ quest, count, fir }) => (
                    <button key={quest.id} className="quest-chip" onClick={() => onQuestClick(quest)}>
                      {quest.name} ×{count}
                      {fir && <span className="fir-inline"> FIR</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {u!.stations.length > 0 && (
              <div className="modal-section">
                <span className="modal-label">Hideout builds</span>
                <div className="badge-group">
                  {u!.stations.map(({ level, count }) => (
                    <span key={level.key} className="badge map-badge station-badge">
                      {level.stationName} {level.level} ×{count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(u!.barterOutputs.length > 0 || u!.craftOutputs.length > 0) && (
              <div className="modal-section">
                <span className="modal-label">Obtained from</span>
                <div className="quest-chips">
                  {u!.barterOutputs.map((b) => (
                    <button key={b.id} className="quest-chip" onClick={() => onBarterClick(b)}>
                      {b.trader} barter
                    </button>
                  ))}
                  {u!.craftOutputs.map((c) => (
                    <button key={c.id} className="quest-chip" onClick={() => onCraftClick(c)}>
                      {c.station} craft
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(u!.barterInputs.length > 0 || u!.craftInputs.length > 0) && (
              <div className="modal-section">
                <span className="modal-label">Used to get</span>
                <div className="quest-chips">
                  {u!.barterInputs.map((b) => (
                    <button key={b.id} className="quest-chip" onClick={() => onBarterClick(b)} title={`${b.trader} barter`}>
                      {rewardName(b.reward)}
                    </button>
                  ))}
                  {u!.craftInputs.map((c) => (
                    <button key={c.id} className="quest-chip" onClick={() => onCraftClick(c)} title={`${c.station} craft`}>
                      {rewardName(c.reward)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
