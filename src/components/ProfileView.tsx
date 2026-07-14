import type { Profile } from '../types'
import { MAX_LOYALTY } from '../hooks/useProfile'

interface Props {
  profile: Profile
  traders: string[]
  onSetPmcLevel: (level: number) => void
  onSetTraderLevel: (trader: string, level: number) => void
  onResetForWipe: () => void
}

export function ProfileView({ profile, traders, onSetPmcLevel, onSetTraderLevel, onResetForWipe }: Props) {
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

      <div className="profile-section">
        <span className="best-label">New wipe</span>
        <p className="legend profile-hint">
          Clears everything you've tracked — completed &amp; active quests, quest progress, inventory, hideout,
          and trader/PMC levels — for a fresh start. Export a backup with <strong>Save progress</strong> first if
          you might want it back.
        </p>
        <button className="danger-btn" onClick={onResetForWipe}>
          Reset for wipe
        </button>
      </div>
    </div>
  )
}
