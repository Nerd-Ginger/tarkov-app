import { useMemo, useState } from 'react'
import type { Barter, Craft, PriceRow, Profile, RawMap } from '../types'
import type { ItemUsage } from '../data/itemUsage'
import { MAX_SKILL } from '../hooks/useProfile'
import { sellOption } from '../data/tradeAccess'
import { duration } from '../data/timeFormat'
import {
  FILTER_PHYSICAL_BOOST,
  FLEA_MIN_LEVEL,
  FUEL_TYPES,
  ITEM,
  STATION,
  btcCraftSec,
  builtLevel,
  cheapest,
  countsByMap,
  farmEconomics,
  farmGpuCap,
  filterHours,
  fleaGated,
  fuelUnitsPerHour,
  hasLootData,
  hoursPerBtc,
  itemRoutes,
} from '../data/upkeep'
import type { Route, RouteContext } from '../data/upkeep'

interface Props {
  crafts: Craft[]
  built: Set<string>
  done: Set<string>
  profile: Profile
  locked: Set<string>
  pricesById: Map<string, PriceRow>
  usage: Map<string, ItemUsage>
  maps: RawMap[]
  loading: boolean
  offline: boolean
  onRefresh: () => void
  onSetHideoutManagement: (level: number) => void
  onOpenBarter: (b: Barter) => void
  onOpenCraft: (c: Craft) => void
}

const rub = (n: number) => `₽${Math.round(n).toLocaleString()}`
const num = (n: number, d = 1) => n.toLocaleString(undefined, { maximumFractionDigits: d })
const hours = (h: number) => (Number.isFinite(h) ? duration(h * 3600) : '—')

/** Kind badge reuses Yard Sale's colours; trader and flea are both a "buy". */
const KIND_CLASS: Record<Route['kind'], string> = {
  trader: 'kind-buy',
  flea: 'kind-flea',
  barter: 'kind-barter',
  craft: 'kind-craft',
}

function RouteCell({
  r,
  onOpenBarter,
  onOpenCraft,
}: {
  r: Route
  onOpenBarter: (b: Barter) => void
  onOpenCraft: (c: Craft) => void
}) {
  const open = r.kind === 'barter' ? () => onOpenBarter(r.barter) : r.kind === 'craft' ? () => onOpenCraft(r.craft) : undefined
  return (
    <button
      className={`route-line ${open ? '' : 'static'} ${r.gated ? 'gated' : ''}`}
      onClick={open}
      title={r.gated ? r.why : open ? 'Open the full recipe' : undefined}
    >
      <span className={`route-kind ${KIND_CLASS[r.kind]}`}>{r.kind}</span>
      <span className="route-where">
        {r.gated && '🔒 '}
        {r.label}
      </span>
      {r.gated && <span className="route-gated warn-text">{r.why}</span>}
    </button>
  )
}

/** "≥₽12,000" when the cost is a floor, "—" when it can't be priced at all. */
function Cost({ r, per = 1 }: { r: Route; per?: number }) {
  if (r.cost == null) return <span className="route-where">—</span>
  return (
    <span className="route-cost">
      {r.atLeast && <span className="cost-bound">≥</span>}
      {rub(r.cost * per)}
    </span>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="upkeep-stat" title={hint}>
      <span className="upkeep-stat-label">{label}</span>
      <span className="upkeep-stat-value">{value}</span>
    </div>
  )
}

export function UpkeepView({
  crafts,
  built,
  done,
  profile,
  locked,
  pricesById,
  usage,
  maps,
  loading,
  offline,
  onRefresh,
  onSetHideoutManagement,
  onOpenBarter,
  onOpenCraft,
}: Props) {
  const genLevel = builtLevel(built, STATION.generator)
  const farmLevel = builtLevel(built, STATION.bitcoinFarm)
  const solarBuilt = builtLevel(built, STATION.solarPower) > 0
  const afuBuilt = builtLevel(built, STATION.airFilteringUnit) > 0
  const hm = profile.skills.hideoutManagement

  // null = follow the hideout checkboxes; a value = the user's what-if
  const [gpuOverride, setGpuOverride] = useState<number | null>(null)
  const [solarOverride, setSolarOverride] = useState<boolean | null>(null)
  const solar = solarOverride ?? solarBuilt
  // with no farm built, show Farm 3 numbers — the useful "is it worth building" view
  const cap = farmGpuCap(farmLevel || 3)
  const gpus = Math.min(gpuOverride ?? cap, cap)

  const ctx: RouteContext = useMemo(
    () => ({ pricesById, usage, profile, locked, built, done }),
    [pricesById, usage, profile, locked, built, done],
  )
  const routes = useMemo(() => {
    const m = new Map<string, Route[]>()
    for (const id of [ITEM.metalFuel, ITEM.expeditionaryFuel, ITEM.filter, ITEM.gpu]) m.set(id, itemRoutes(id, ctx))
    return m
  }, [ctx])

  const craftSec = btcCraftSec(crafts)
  const unitsPerHour = fuelUnitsPerHour(hm, solar)
  const btcHours = hoursPerBtc(gpus, craftSec)
  const unitsPerBtc = unitsPerHour * btcHours

  // cheapest fuel by ₽/unit across both tank types — the two burn identically
  const fuelBest = useMemo(() => {
    let best: { perUnit: number; route: Route; fuel: (typeof FUEL_TYPES)[number] } | null = null
    for (const fuel of FUEL_TYPES) {
      const r = cheapest(routes.get(fuel.id) ?? [])
      if (r?.cost == null) continue
      const perUnit = r.cost / fuel.units
      if (!best || perUnit < best.perUnit) best = { perUnit, route: r, fuel }
    }
    return best
  }, [routes])

  const btcPrice = pricesById.get(ITEM.bitcoin)
  // Physical bitcoin is flea-banned, so a trader sale is the only exit
  const btcSell = btcPrice ? (sellOption(btcPrice, locked)?.price ?? 0) : 0
  const btcSellTo = btcPrice ? sellOption(btcPrice, locked)?.source : undefined
  const gpuBest = cheapest(routes.get(ITEM.gpu) ?? [])
  const farm = farmEconomics({
    gpus,
    cap,
    craftSec,
    btcSell,
    fuelPerHourCost: (fuelBest?.perUnit ?? 0) * unitsPerHour,
    gpuCost: gpuBest?.cost ?? null,
  })

  const filterH = filterHours(hm)
  const filterBest = cheapest(routes.get(ITEM.filter) ?? [])

  const lootReady = hasLootData(maps)
  const fuelSpawns = useMemo(
    () =>
      countsByMap(maps, (m) => (m.loot?.[ITEM.metalFuel] ?? 0) + (m.loot?.[ITEM.expeditionaryFuel] ?? 0)).map((c) => ({
        ...c,
        metal: c.source.loot?.[ITEM.metalFuel] ?? 0,
        exped: c.source.loot?.[ITEM.expeditionaryFuel] ?? 0,
      })),
    [maps],
  )
  const gpuSpawns = useMemo(() => countsByMap(maps, (m) => m.loot?.[ITEM.gpu] ?? 0), [maps])
  const crateSpawns = useMemo(
    () =>
      countsByMap(maps, (m) => m.crates?.['technical-supply-crate'] ?? 0).map((c) => ({
        ...c,
        toolbox: c.source.crates?.['toolbox'] ?? 0,
      })),
    [maps],
  )

  const noPrices = pricesById.size === 0
  const flea = fleaGated(profile)

  const routeRows = (id: string, units: number) =>
    (routes.get(id) ?? []).map((r, i) => (
      <tr key={`${id}-${i}`} className={r.gated ? 'upkeep-gated' : ''}>
        <td>
          <RouteCell r={r} onOpenBarter={onOpenBarter} onOpenCraft={onOpenCraft} />
        </td>
        <td className="num-col">
          <Cost r={r} />
        </td>
        <td className="num-col">
          <Cost r={r} per={1 / units} />
        </td>
        <td className="num-col">
          <Cost r={r} per={unitsPerBtc / units} />
        </td>
        <td className="num-col">
          <Cost r={r} per={(unitsPerHour * 24) / units} />
        </td>
      </tr>
    ))

  return (
    <div className="upkeep-view">
      {noPrices && (
        <p className="empty-note">
          {loading ? 'Loading prices…' : offline ? 'Offline — prices will show once they load.' : 'No prices yet.'}{' '}
          {!loading && (
            <button className="clear-btn" onClick={onRefresh}>
              Fetch prices
            </button>
          )}
        </p>
      )}

      <div className="filter-bar">
        <div className="filter-row upkeep-inputs">
          <label className="num-label profile-pmc" title="0.5% less fuel and filter burn per level, up to 25%. 51 = elite.">
            Hideout Management
            <input
              type="number"
              min={0}
              max={MAX_SKILL}
              value={hm || ''}
              placeholder="0"
              onChange={(e) => onSetHideoutManagement(Number.parseInt(e.target.value, 10) || 0)}
            />
          </label>
          <label className="num-label profile-pmc" title={`Farm ${farmLevel || '—'} holds up to ${cap} GPUs.`}>
            GPUs
            <input
              type="number"
              min={1}
              max={cap}
              value={gpus}
              onChange={(e) => setGpuOverride(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
            />
            {gpuOverride === null ? (
              <span className="upkeep-auto">auto · cap</span>
            ) : (
              <button className="clear-btn" onClick={() => setGpuOverride(null)}>
                reset
              </button>
            )}
          </label>
          <label className="check-label" title="Solar Power halves generator fuel burn.">
            <input type="checkbox" checked={solar} onChange={(e) => setSolarOverride(e.target.checked)} />
            Solar power
            {solarOverride === null ? (
              <span className="upkeep-auto">auto</span>
            ) : (
              <button className="clear-btn" onClick={() => setSolarOverride(null)}>
                reset
              </button>
            )}
          </label>
        </div>
        <div className="filter-row upkeep-detected">
          <span className="filter-label">From Hideout &amp; Profile</span>
          <span>Generator {genLevel || '—'}</span>
          <span>Bitcoin Farm {farmLevel || '—'}</span>
          <span>Solar {solarBuilt ? '✓' : '—'}</span>
          <span>Air Filtering Unit {afuBuilt ? '✓' : '—'}</span>
          <span className={flea ? 'warn-text' : ''}>
            PMC {profile.pmcLevel || '?'}
            {flea ? ` · flea locked until ${FLEA_MIN_LEVEL}` : ''}
          </span>
        </div>
      </div>

      <section>
        <h2>Fuel</h2>
        <p className="legend">
          Your generator burns <strong>{num(unitsPerHour, 2)} units/h</strong> — a Metal tank lasts{' '}
          <strong>{hours(100 / unitsPerHour)}</strong>, an Expeditionary tank <strong>{hours(60 / unitsPerHour)}</strong>.
          At {gpus} GPU{gpus === 1 ? '' : 's'} one bitcoin takes <strong>{hours(btcHours)}</strong>, so it costs{' '}
          <strong>{num(unitsPerBtc)} units</strong> of fuel ({num(unitsPerBtc / 100, 2)} Metal or{' '}
          {num(unitsPerBtc / 60, 2)} Expeditionary). Burn is flat regardless of what's running, so this charges the whole
          generator to the farm — right if the farm is why it's on. Generator level and player level don't change burn;
          player level only gates the flea ({FLEA_MIN_LEVEL}+). Flea tanks are often part-used — check the units.
        </p>
        {FUEL_TYPES.map((fuel) => (
          <div className="table-wrap upkeep-table-wrap" key={fuel.id}>
            <table className="yardsale-table upkeep-table">
              <thead>
                <tr>
                  <th>{fuel.name} ({fuel.units}u)</th>
                  <th className="num-col">Per tank</th>
                  <th className="num-col">Per unit</th>
                  <th className="num-col">Per BTC</th>
                  <th className="num-col">Per day</th>
                </tr>
              </thead>
              <tbody>
                {routeRows(fuel.id, fuel.units)}
                {(routes.get(fuel.id) ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="route-where">
                      No buy, barter or craft routes in the data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
        {!fuelBest && !noPrices && (
          <p className="legend warn-text">
            No fuel route is open at your levels — raise trader loyalty in Profile (Jaeger LL2 sells Metal tanks), or
            reach PMC {FLEA_MIN_LEVEL} for the flea. Farm net below needs a fuel price.
          </p>
        )}
        {fuelBest && (
          <p className="legend">
            Cheapest today: <strong>{fuelBest.fuel.name}</strong> via {fuelBest.route.label} at{' '}
            <strong>{rub(fuelBest.perUnit)}/unit</strong> → {rub(fuelBest.perUnit * unitsPerBtc)} per bitcoin,{' '}
            {rub(fuelBest.perUnit * unitsPerHour * 24)} per day.
          </p>
        )}
      </section>

      <section>
        <h2>Bitcoin farm</h2>
        <p className="legend">
          {farmLevel === 0
            ? 'Bitcoin Farm not built — showing Farm 3 (50 GPUs) as a what-if. '
            : farmLevel < 3
              ? `Farm ${farmLevel} holds ${cap} GPUs. `
              : ''}
          {farmLevel === 1 && genLevel < 3 && <span className="warn-text">Farm 2 needs Generator 3. </span>}
          {farmLevel === 2 && !solarBuilt && <span className="warn-text">Farm 3 needs Solar Power. </span>}
          Bitcoins sell to {btcSellTo ?? 'a trader'} (flea-banned). The farm stops at 3 stored — collect them. Each GPU
          adds less than the last.
        </p>
        <div className="upkeep-stats">
          <Stat label="Per bitcoin" value={hours(farm.hoursPerBtc)} />
          <Stat label="Bitcoins / day" value={num(farm.btcPerDay, 2)} />
          <Stat label="Revenue / day" value={btcSell ? rub(farm.revenuePerDay) : '—'} hint={btcSell ? `${rub(btcSell)} each` : undefined} />
          <Stat label="Fuel / day" value={fuelBest ? rub(farm.fuelPerDay) : '—'} />
          <Stat label="Net / day" value={btcSell && fuelBest ? rub(farm.netPerDay) : '—'} />
          <Stat
            label="Next GPU adds"
            value={farm.nextGpuPerDay != null && btcSell ? `${rub(farm.nextGpuPerDay)}/day` : '—'}
            hint={farm.nextGpuPerDay == null ? 'Farm is full' : undefined}
          />
          <Stat
            label={`Fill to ${cap}`}
            value={farm.fillCost == null ? '—' : farm.fillCost === 0 ? 'Full' : rub(farm.fillCost)}
            hint={gpuBest ? `${cap - gpus} × ${rub(gpuBest.cost ?? 0)} via ${gpuBest.label}` : undefined}
          />
          <Stat label="Pays back in" value={farm.paybackDays != null ? `${num(farm.paybackDays)} days` : '—'} />
        </div>
        <div className="table-wrap upkeep-table-wrap">
          <table className="yardsale-table upkeep-table">
            <thead>
              <tr>
                <th>Graphics card</th>
                <th className="num-col">Cost</th>
              </tr>
            </thead>
            <tbody>
              {(routes.get(ITEM.gpu) ?? []).map((r, i) => (
                <tr key={i} className={r.gated ? 'upkeep-gated' : ''}>
                  <td>
                    <RouteCell r={r} onOpenBarter={onOpenBarter} onOpenCraft={onOpenCraft} />
                  </td>
                  <td className="num-col">
                    <Cost r={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Air filters</h2>
        <p className="legend">
          The Air Filtering Unit gives <strong>+{Math.round(FILTER_PHYSICAL_BOOST * 100)}% Physical skill XP</strong>{' '}
          (Endurance, Strength, Vitality, Health, Stress Resistance, Metabolism, Immunity) while it has a filter and power.{' '}
          {afuBuilt ? 'You have it built.' : 'Not built yet — it needs Generator 3 and Vents 3.'} One FP-100 lasts{' '}
          <strong>{hours(filterH)}</strong> at your Hideout Management, so you use{' '}
          <strong>{num(24 / filterH, 2)} a day</strong>
          {filterBest?.cost != null && (
            <>
              {' '}
              — <strong>{rub((filterBest.cost * 24) / filterH)}/day</strong> via {filterBest.label}
            </>
          )}
          . Solar doesn't help here; it only halves fuel.
        </p>
        <div className="table-wrap upkeep-table-wrap">
          <table className="yardsale-table upkeep-table">
            <thead>
              <tr>
                <th>FP-100 filter absorber</th>
                <th className="num-col">Per filter</th>
                <th className="num-col">Per day</th>
              </tr>
            </thead>
            <tbody>
              {(routes.get(ITEM.filter) ?? []).map((r, i) => (
                <tr key={i} className={r.gated ? 'upkeep-gated' : ''}>
                  <td>
                    <RouteCell r={r} onOpenBarter={onOpenBarter} onOpenCraft={onOpenCraft} />
                  </td>
                  <td className="num-col">
                    <Cost r={r} />
                  </td>
                  <td className="num-col">
                    <Cost r={r} per={24 / filterH} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Where to find them</h2>
        {!lootReady ? (
          <p className="empty-note">Spawn data comes from the JSON API — it'll show after the next data refresh.</p>
        ) : (
          <>
            <p className="legend">
              Loose-loot spawn points per map (places it <em>can</em> roll, not a guarantee). FP-100s never spawn loose —
              they come from containers, mostly <strong>technical supply crates</strong>, sometimes toolboxes — so the
              filter column counts those instead.
            </p>
            <div className="upkeep-spawns">
              <div className="table-wrap upkeep-table-wrap">
                <table className="yardsale-table upkeep-table">
                  <thead>
                    <tr>
                      <th>Fuel</th>
                      <th className="num-col">Metal</th>
                      <th className="num-col">Exped.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fuelSpawns.map((c) => (
                      <tr key={c.map}>
                        <td>{c.map}</td>
                        <td className="num-col">{c.metal}</td>
                        <td className="num-col">{c.exped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-wrap upkeep-table-wrap">
                <table className="yardsale-table upkeep-table">
                  <thead>
                    <tr>
                      <th>Filters (containers)</th>
                      <th className="num-col">Tech crates</th>
                      <th className="num-col">Toolboxes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crateSpawns.map((c) => (
                      <tr key={c.map}>
                        <td>{c.map}</td>
                        <td className="num-col">{c.count}</td>
                        <td className="num-col">{c.toolbox}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-wrap upkeep-table-wrap">
                <table className="yardsale-table upkeep-table">
                  <thead>
                    <tr>
                      <th>Graphics card</th>
                      <th className="num-col">Spawns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gpuSpawns.map((c) => (
                      <tr key={c.map}>
                        <td>{c.map}</td>
                        <td className="num-col">{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
