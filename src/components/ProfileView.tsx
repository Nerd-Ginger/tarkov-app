import type { Profile } from '../types'
import { MAX_LOYALTY } from '../hooks/useProfile'

interface Props {
  profile: Profile
  traders: string[]
  onSetPmcLevel: (level: number) => void
  onSetTraderLevel: (trader: string, level: number) => void
}

export function ProfileView({ profile, traders, onSetPmcLevel, onSetTraderLevel }: Props) {
  return (
    <div className="profile-view">
      <div className="profile-section">
        <span className="best-label">Character</span>
        <label className="num-label profile-pmc">
          PMC level
          <input
            type="number"
            min={1}
            max={79}
            value={profile.pmcLevel || ''}
            placeholder="1"
            onChange={(e) => onSetPmcLevel(Number.parseInt(e.target.value, 10) || 0)}
          />
        </label>
      </div>

      <div className="profile-section">
        <span className="best-label">Trader loyalty</span>
        <p className="legend profile-hint">
          Set how far you've leveled each trader. The Barter view's <strong>Can buy</strong> toggle uses these
          (plus completed quest unlocks) to show only barters you actually have access to.
        </p>
        <div className="profile-traders">
          {traders.map((t) => {
            const level = profile.traders[t] ?? 1
            return (
              <div key={t} className="profile-trader">
                <span className="profile-trader-name">{t}</span>
                <div className="loyalty-pills">
                  {Array.from({ length: MAX_LOYALTY }, (_, i) => i + 1).map((ll) => (
                    <button
                      key={ll}
                      className={`loyalty-pill ${level >= ll ? 'on' : ''}`}
                      onClick={() => onSetTraderLevel(t, ll)}
                      title={`Set ${t} to loyalty level ${ll}`}
                    >
                      {ll}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
