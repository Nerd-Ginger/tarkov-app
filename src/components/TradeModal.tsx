import { useEffect } from 'react'
import type { Barter, Craft, Profile, StationLevel } from '../types'
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
  onClose: () => void
}

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

export function TradeModal({ data, profile, done, built, onClose }: Props) {
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

        <div className="modal-section">
          <span className="modal-label">You get</span>
          <TradeList items={reward} />
        </div>
        <div className="modal-section">
          <span className="modal-label">You give</span>
          <TradeList items={required} />
          {fir && <p className="req-fir-note">✱ items are banned from the flea market — find them in raid.</p>}
        </div>
      </div>
    </div>
  )
}
