import { useEffect } from 'react'
import type { Barter, Craft, PriceRow, Profile, StationLevel, TradeItem } from '../types'
import { ROUBLES_ID } from '../api/prices'
import { traderLoyalty } from '../hooks/useProfile'
import { FirBadge, TradeList } from './TradeParts'

export type TradeModalData =
  | { kind: 'barter'; barter: Barter }
  | { kind: 'craft'; craft: Craft; stationLevel: StationLevel | undefined }

interface Props {
  data: TradeModalData | null
  profile: Profile
  done: Set<string>
  built: Set<string>
  prices: Map<string, PriceRow>
  onClose: () => void
}

interface SideValue {
  total: number
  /** Items with no usable price (flea-banned inputs, unlisted items). */
  unpriced: TradeItem[]
}

/** Cost to buy the inputs off the flea (Roubles = face value). */
function giveCost(items: TradeItem[], prices: Map<string, PriceRow>): SideValue {
  let total = 0
  const unpriced: TradeItem[] = []
  for (const t of items) {
    if (t.item.id === ROUBLES_ID) {
      total += t.count
      continue
    }
    const flea = prices.get(t.item.id)?.flea
    if (t.noFlea || flea == null) unpriced.push(t)
    else total += flea * t.count
  }
  return { total, unpriced }
}

/** What the rewards are worth — flea when sellable, else best trader. */
function getValue(items: TradeItem[], prices: Map<string, PriceRow>): SideValue {
  let total = 0
  const unpriced: TradeItem[] = []
  for (const t of items) {
    if (t.item.id === ROUBLES_ID) {
      total += t.count
      continue
    }
    const p = prices.get(t.item.id)
    const v = p?.flea ?? (p && p.trader > 0 ? p.trader : null)
    if (v == null) unpriced.push(t)
    else total += v * t.count
  }
  return { total, unpriced }
}

const rub = (n: number) => `₽${Math.round(n).toLocaleString()}`

/** true = met, false = unmet, null = can't verify (e.g. a skill level). */
function ReqRow({ met, label, sub }: { met: boolean | null; label: React.ReactNode; sub?: boolean }) {
  const mark = met === null ? '–' : met ? '✓' : '✗'
  const cls = met === null ? 'unknown' : met ? 'met' : 'unmet'
  return (
    <li className={`req-row ${cls} ${sub ? 'sub' : ''}`}>
      <span className="req-mark">{mark}</span>
      <span className="req-label">{label}</span>
    </li>
  )
}

function maxBuiltLevel(built: Set<string>, stationId: string): number {
  let max = 0
  for (const key of built) {
    const i = key.lastIndexOf(':')
    if (key.slice(0, i) === stationId) max = Math.max(max, Number.parseInt(key.slice(i + 1), 10) || 0)
  }
  return max
}

export function TradeModal({ data, profile, done, built, prices, onClose }: Props) {
  useEffect(() => {
    if (!data) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data, onClose])

  if (!data) return null

  const reward = data.kind === 'barter' ? data.barter.reward : data.craft.reward
  const required = data.kind === 'barter' ? data.barter.required : data.craft.required
  const fir = data.kind === 'barter' ? data.barter.fir : data.craft.fir
  const rewardName = reward[0]?.item.name ?? 'Trade'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <h3 className="modal-title">
          {rewardName}
          {fir && <> <FirBadge /></>}
        </h3>
        <div className="modal-meta">
          {data.kind === 'barter' ? (
            <span>{data.barter.trader} barter</span>
          ) : (
            <span>{data.craft.station} craft</span>
          )}
        </div>

        <div className="modal-section">
          <span className="modal-label">Unlock requirements</span>
          <ul className="req-list">
            {data.kind === 'barter' ? (
              <>
                <ReqRow
                  met={traderLoyalty(profile, data.barter.trader) >= data.barter.level}
                  label={`${data.barter.trader} loyalty LL${data.barter.level}`}
                />
                {data.barter.unlockQuest && (
                  <ReqRow
                    met={done.has(data.barter.unlockQuest.id)}
                    label={<>Complete quest: <strong>{data.barter.unlockQuest.name}</strong></>}
                  />
                )}
              </>
            ) : (
              <>
                <ReqRow
                  met={maxBuiltLevel(built, data.craft.stationId) >= data.craft.level}
                  label={<>Build <strong>{data.craft.station}</strong> to level {data.craft.level}</>}
                />
                {data.stationLevel && (
                  <>
                    {data.stationLevel.stationPrereqs.map((p, i) => (
                      <ReqRow
                        key={`s${i}`}
                        sub
                        met={maxBuiltLevel(built, p.stationId) >= p.level}
                        label={`${p.stationName} level ${p.level}`}
                      />
                    ))}
                    {data.stationLevel.traderReqs.map((t, i) => (
                      <ReqRow
                        key={`t${i}`}
                        sub
                        met={traderLoyalty(profile, t.trader) >= t.level}
                        label={`${t.trader} loyalty LL${t.level}`}
                      />
                    ))}
                    {data.stationLevel.skillReqs.map((sk, i) => (
                      <ReqRow key={`k${i}`} sub met={null} label={`${sk.name} skill level ${sk.level}`} />
                    ))}
                  </>
                )}
              </>
            )}
          </ul>
        </div>

        {(() => {
          if (prices.size === 0) {
            return (
              <div className="modal-section">
                <span className="modal-label">Worth it?</span>
                <p className="empty-note">Prices unavailable — connect once so live flea prices can load.</p>
              </div>
            )
          }
          const cost = giveCost(required, prices)
          const value = getValue(reward, prices)
          const profit = value.total - cost.total
          return (
            <div className="modal-section">
              <span className="modal-label">Worth it?</span>
              <div className="verdict">
                <span>Cost ≈ <strong>{rub(cost.total)}</strong></span>
                <span>·</span>
                <span>Value ≈ <strong>{rub(value.total)}</strong></span>
                <span>·</span>
                <span className={profit >= 0 ? 'verdict-good' : 'verdict-bad'}>
                  {profit >= 0 ? '+' : '−'}{rub(Math.abs(profit))} {profit >= 0 ? 'profit' : 'loss'}
                </span>
              </div>
              {cost.unpriced.length > 0 && (
                <p className="verdict-note">
                  …plus {cost.unpriced.map((t) => `${t.count}× ${t.item.shortName}`).join(', ')} you can't buy on
                  flea (find in raid) — real cost is higher.
                </p>
              )}
              {value.unpriced.length > 0 && (
                <p className="verdict-note">Some rewards have no market price and aren't counted.</p>
              )}
              <p className="verdict-note dim">Flea 24h averages, before flea listing fees.</p>
            </div>
          )
        })()}

        <div className="modal-section">
          <span className="modal-label">You get</span>
          <TradeList items={reward} prices={prices} />
        </div>
        <div className="modal-section">
          <span className="modal-label">You give</span>
          <TradeList items={required} prices={prices} />
          {fir && <p className="req-fir-note">✱ items are banned from the flea market — find them in raid.</p>}
        </div>
      </div>
    </div>
  )
}
