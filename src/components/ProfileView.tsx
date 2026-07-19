import type { Profile } from '../types'
import { MAX_LOYALTY } from '../hooks/useProfile'
import { GATED_TRADERS } from '../data/traderGate'

interface Props {
  profile: Profile
  traders: string[]
  /** Gated traders already unlocked by a completed quest — shown but not editable. */
  autoUnlocked: Set<string>
  /** Trader → name of the quest that grants it, when the data names one. */
  unlockQuests: Record<string, string | null>
  onSetPmcLevel: (level: number) => void
  onSetTraderLevel: (trader: string, level: number) => void
  onSetTraderUnlocked: (trader: string, unlocked: boolean) => void
  onResetForWipe: () => void
}

export function ProfileView({
  profile,
  traders,
  autoUnlocked,
  unlockQuests,
  onSetPmcLevel,
  onSetTraderLevel,
  onSetTraderUnlocked,
  onResetForWipe,
}: Props) {
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
        <span className="best-label">Traders unlocked</span>
        <p className="legend profile-hint">
          Traders you don't start with. Their quests stay hidden until you have access, so they can't
          turn up in Best Quests before you can actually take them.
        </p>
        <div className="unlock-traders">
          {GATED_TRADERS.map((t) => {
            const auto = autoUnlocked.has(t)
            const gateQuest = unlockQuests[t]
            const on = auto || profile.unlockedTraders[t] === true
            const title = auto
              ? `Unlocked automatically — you've completed ${gateQuest ?? 'the quest that grants ' + t}.`
              : gateQuest
                ? `Unlocks on its own once you complete "${gateQuest}". Tick if you already have access.`
                : `No quest in the data grants ${t}, so this can't be detected — tick it once you've unlocked him in game.`
            return (
              <label
                key={t}
                className={`check-label unlock-trader ${on ? 'on' : ''} ${auto ? 'auto' : ''}`}
                title={title}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={auto}
                  onChange={(e) => onSetTraderUnlocked(t, e.target.checked)}
                />
                {t}
                {auto && <span className="unlock-src"> · auto</span>}
                {!auto && !gateQuest && <span className="unlock-src"> · set by hand</span>}
              </label>
            )
          })}
        </div>
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
