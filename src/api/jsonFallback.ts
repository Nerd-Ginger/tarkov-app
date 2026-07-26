import type {
  ItemRef,
  RawAmmo,
  RawBarter,
  RawCraft,
  RawHideoutStation,
  RawMap,
  RawObjective,
  RawStim,
  RawStimEffect,
  RawTask,
  RawTradeItem,
} from '../types'
import type { RawIntel } from './intel'
import type { RawPriceItem } from './prices'

/**
 * Fallback data source: tarkov.dev's JSON API.
 *
 * Their GraphQL runs on a VPS that goes down periodically, and as of mid-2026
 * the Cloudflare Worker that used to fail over for it was removed (it cost too
 * much). The JSON API is the stable path they now point at, so we use it when
 * GraphQL is unreachable.
 *
 * Everything here adapts JSON payloads into the *raw GraphQL shapes* the rest
 * of the app already consumes, so trim()/normalize()/normalizeTasks() and every
 * component stay untouched — the fallback is invisible past this file.
 *
 * Shape differences the adapters bridge: JSON stores plain id strings and
 * translation keys, resolved against a per-endpoint `_en` dictionary, and it
 * uses singular `offeredItem`/`productItem` where GraphQL returns arrays.
 */

const JSON_BASE = 'https://json.tarkov.dev/pve/'
const JSON_TIMEOUT_MS = 20_000
/** items is ~1.25MB gzipped; tasks and prices both need it, so share the fetch. */
const MEMO_MS = 5 * 60 * 1000

export const FORCE_JSON_KEY = 'tarkov.forceJsonApi'

/** Debug/escape hatch: set localStorage.tarkov.forceJsonApi = '1' to skip GraphQL. */
export function forceJson(): boolean {
  try {
    return localStorage.getItem(FORCE_JSON_KEY) === '1'
  } catch {
    return false
  }
}

type Dict = Record<string, string>

const memo = new Map<string, { at: number; promise: Promise<unknown> }>()

function fetchJson<T>(name: string): Promise<T> {
  const hit = memo.get(name)
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.promise as Promise<T>
  const promise = (async () => {
    const res = await fetch(`${JSON_BASE}${name}`, { signal: AbortSignal.timeout(JSON_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`json.tarkov.dev/${name} returned ${res.status}`)
    const body = await res.json()
    // every endpoint wraps its payload in { data: ... }
    return (body?.data ?? body) as T
  })()
  // a failed fetch shouldn't be remembered — drop it so the next call retries
  promise.catch(() => memo.delete(name))
  memo.set(name, { at: Date.now(), promise })
  return promise as Promise<T>
}

/** Translation keys resolve against the endpoint's `_en` dict; unknown keys pass through. */
function translate(dict: Dict | undefined) {
  return (key: string | null | undefined): string => (key == null ? '' : (dict?.[key] ?? key))
}

// ---- raw JSON payload shapes (only the fields we read) ----

interface JsonItem {
  id: string
  width: number | null
  height: number | null
  types: string[] | null
  wikiLink?: string
  avg24hPrice: number | null
  lastLowPrice: number | null
  low24hPrice: number | null
  high24hPrice: number | null
  changeLast48hPercent: number | null
  sellToTrader?: { trader: string; priceRUB: number }[] | null
  buyFromTrader?: { trader: string; priceRUB: number; minTraderLevel?: number | null }[] | null
  properties?: Record<string, unknown> | null
}

interface JsonTradeItem {
  item: string
  count: number
}

interface JsonObjective {
  id: string
  description: string
  type: string
  optional: boolean
  maps?: string[] | null
  count?: number | null
  items?: string[] | null
  foundInRaid?: boolean | null
}

interface JsonTask {
  id: string
  name: string
  trader: string | null
  map: string | null
  wikiLink: string
  minPlayerLevel: number
  kappaRequired: boolean
  lightkeeperRequired?: boolean
  experience?: number
  objectives?: JsonObjective[] | null
  taskRequirements?: { task: string; status: string[] }[] | null
  finishRewards?: {
    items?: JsonTradeItem[] | null
    traderStanding?: { trader: string; standing: number }[] | null
    offerUnlock?: { trader: string; level: number; item: string }[] | null
    traderUnlock?: string[] | null
    skillLevelReward?: { skill: string; level: number }[] | null
  } | null
}

interface JsonTrader {
  id: string
  name: string
  resetTime: string | null
}

interface JsonMap {
  id: string
  name: string
  normalizedName?: string
  locks?: { lockType: string; needsPower: boolean; key: string | null }[] | null
  bosses?: {
    mob: string
    spawnChance: number | null
    escorts?: { mob: string; amount?: { count: number | null; chance: number | null }[] | null }[] | null
  }[] | null
}

interface JsonStation {
  id: string
  name: string
  levels?: {
    level: number
    itemRequirements?: JsonTradeItem[] | null
    stationLevelRequirements?: { station: string; level: number }[] | null
    traderRequirements?: { requirementType?: string; trader: string; value?: number }[] | null
    skillRequirements?: { requirementType?: string; name?: string; skill?: string; value?: number; level?: number }[] | null
  }[] | null
}

interface JsonBarter {
  id: string
  trader: string
  minTraderLevel: number
  taskUnlock: string | null
  requiredItems?: JsonTradeItem[] | null
  offeredItem?: JsonTradeItem | null
}

interface JsonCraft {
  id: string
  station: string
  level: number
  duration: number
  requiredItems?: JsonTradeItem[] | null
  productItem?: JsonTradeItem | null
}

/** Endpoints are keyed by id; a few are arrays. Normalize both to an array. */
function values<T>(payload: unknown, key?: string): T[] {
  const root = key ? (payload as Record<string, unknown>)?.[key] : payload
  if (Array.isArray(root)) return root as T[]
  if (root && typeof root === 'object') return Object.values(root as Record<string, T>)
  return []
}

// ---- prices ----

export async function pricesFromJson(): Promise<RawPriceItem[]> {
  const [itemsRaw, itemsEn, tradersEn] = await Promise.all([
    fetchJson<unknown>('items'),
    fetchJson<Dict>('items_en'),
    fetchJson<Dict>('traders_en'),
  ])
  const items = values<JsonItem>(itemsRaw, 'items')
  if (items.length === 0) throw new Error('json.tarkov.dev returned no items')
  const tEn = translate(itemsEn)
  const trEn = translate(tradersEn)
  // GraphQL reports sources lowercase ('prapor'); cap() restores them for display
  const source = (id: string) => trEn(`${id} Nickname`).toLowerCase()

  return items.map((raw) => ({
    id: raw.id,
    name: tEn(`${raw.id} Name`),
    shortName: tEn(`${raw.id} ShortName`),
    width: raw.width,
    height: raw.height,
    avg24hPrice: raw.avg24hPrice,
    lastLowPrice: raw.lastLowPrice,
    low24hPrice: raw.low24hPrice,
    high24hPrice: raw.high24hPrice,
    changeLast48hPercent: raw.changeLast48hPercent,
    types: raw.types,
    sellFor: (raw.sellToTrader ?? []).map((s) => ({ priceRUB: s.priceRUB, source: source(s.trader) })),
    buyFor: [
      ...(raw.buyFromTrader ?? []).map((b) => ({
        priceRUB: b.priceRUB,
        source: source(b.trader),
        vendor: { minTraderLevel: b.minTraderLevel ?? 0 },
      })),
      // JSON has no explicit flea offer — synthesize one and let trim()'s
      // `traded` guard decide whether the item really trades. Keeping that
      // judgement in one place avoids two definitions drifting apart.
      ...(raw.lastLowPrice && raw.lastLowPrice > 0
        ? [{ priceRUB: raw.lastLowPrice, source: 'fleaMarket', vendor: null }]
        : []),
    ],
  }))
}

// ---- intel ----

export async function intelFromJson(): Promise<RawIntel> {
  const [mapsRaw, mapsEn, tradersRaw, tradersEn] = await Promise.all([
    fetchJson<unknown>('maps'),
    fetchJson<Dict>('maps_en'),
    fetchJson<unknown>('traders'),
    fetchJson<Dict>('traders_en'),
  ])
  const mEn = translate(mapsEn)
  const trEn = translate(tradersEn)
  const maps = values<JsonMap>(mapsRaw, 'maps')
  const goonReports = values<{ map: string; timestamp: string }>(mapsRaw, 'goonReports')

  return {
    // intel filters these to its own TRADER_ORDER, so pass the display name through
    traders: values<JsonTrader>(tradersRaw).map((t) => ({
      name: trEn(`${t.id} Nickname`),
      resetTime: t.resetTime,
    })),
    goonReports: goonReports.map((g) => ({
      map: { name: mEn(`${g.map} Name`) },
      timestamp: g.timestamp,
    })),
    maps: maps.map((m) => ({
      name: mEn(`${m.id} Name`),
      bosses: (m.bosses ?? []).map((b) => ({
        // mob keys are bare in the dictionary ("bossBully" → "Reshala"),
        // unlike map ids which are suffixed with " Name"
        boss: { name: mEn(b.mob) },
        spawnChance: b.spawnChance,
        escorts: (b.escorts ?? []).map((e) => ({
          boss: { name: mEn(e.mob) },
          amount: e.amount ?? [],
        })),
      })),
    })),
  }
}

// ---- tasks (and everything else bundled in the task cache) ----

export interface JsonTaskData {
  tasks: RawTask[]
  stations: RawHideoutStation[]
  ammo: RawAmmo[] | null
  barters: RawBarter[]
  crafts: RawCraft[]
  maps: RawMap[]
  stims: RawStim[] | null
}

export async function tasksFromJson(): Promise<JsonTaskData> {
  const [tasksRaw, tasksEn, itemsRaw, itemsEn, hideoutRaw, hideoutEn, tradersEn, bartersRaw, craftsRaw, mapsRaw, mapsEn] =
    await Promise.all([
      fetchJson<unknown>('tasks'),
      fetchJson<Dict>('tasks_en'),
      fetchJson<unknown>('items'),
      fetchJson<Dict>('items_en'),
      fetchJson<unknown>('hideout'),
      fetchJson<Dict>('hideout_en'),
      fetchJson<Dict>('traders_en'),
      fetchJson<unknown>('barters'),
      fetchJson<unknown>('crafts'),
      fetchJson<unknown>('maps'),
      fetchJson<Dict>('maps_en'),
    ])

  const tEn = translate(tasksEn)
  const iEn = translate(itemsEn)
  const hEn = translate(hideoutEn)
  const trEn = translate(tradersEn)
  const mEn = translate(mapsEn)

  const items = values<JsonItem>(itemsRaw, 'items')
  const itemById = new Map(items.map((i) => [i.id, i]))
  const itemRef = (id: string): ItemRef => ({
    id,
    name: iEn(`${id} Name`),
    shortName: iEn(`${id} ShortName`),
  })
  /** Trade items carry `types` so downstream can flag flea-banned / FIR barters. */
  const tradeItem = (t: JsonTradeItem): RawTradeItem => ({
    item: { ...itemRef(t.item), types: itemById.get(t.item)?.types ?? null },
    count: t.count,
  })
  const traderName = (id: string | null | undefined) => (id ? trEn(`${id} Nickname`) : '')

  const jsonTasks = values<JsonTask>(tasksRaw, 'tasks')
  if (jsonTasks.length === 0) throw new Error('json.tarkov.dev returned no tasks')

  const tasks: RawTask[] = jsonTasks.map((t) => ({
    id: t.id,
    name: tEn(t.name),
    minPlayerLevel: t.minPlayerLevel,
    kappaRequired: t.kappaRequired,
    lightkeeperRequired: t.lightkeeperRequired,
    wikiLink: t.wikiLink,
    // JSON carries XP inline, so the GraphQL xpTable merge isn't needed here
    experience: t.experience ?? 0,
    trader: t.trader ? { name: traderName(t.trader) } : null,
    map: t.map ? { name: mEn(`${t.map} Name`) } : null,
    taskRequirements: (t.taskRequirements ?? []).map((r) => ({
      task: { id: r.task },
      status: r.status,
    })),
    objectives: (t.objectives ?? []).map(
      (o): RawObjective => ({
        id: o.id,
        type: o.type,
        description: tEn(o.description),
        optional: o.optional,
        maps: (o.maps ?? []).map((id) => ({ name: mEn(`${id} Name`) })),
        foundInRaid: o.foundInRaid ?? null,
        // GraphQL exposes a single item; JSON lists every acceptable one
        item: o.items?.[0] ? itemRef(o.items[0]) : null,
        count: o.count ?? null,
      }),
    ),
    finishRewards: {
      items: (t.finishRewards?.items ?? []).map((r) => ({ item: itemRef(r.item), count: r.count })),
      traderStanding: (t.finishRewards?.traderStanding ?? []).map((s) => ({
        trader: { name: traderName(s.trader) },
        standing: s.standing,
      })),
      offerUnlock: (t.finishRewards?.offerUnlock ?? []).map((o) => ({
        item: itemRef(o.item),
        trader: { name: traderName(o.trader) },
        level: o.level,
      })),
      // JSON gives bare trader ids where GraphQL gives objects
      traderUnlock: (t.finishRewards?.traderUnlock ?? []).map((id) => ({ name: traderName(id) })),
      skillLevelReward: (t.finishRewards?.skillLevelReward ?? []).map((s) => ({
        name: s.skill,
        level: s.level,
      })),
    },
  }))

  const jsonStations = values<JsonStation>(hideoutRaw)
  const stationName = new Map(jsonStations.map((s) => [s.id, hEn(s.name)]))
  const stations: RawHideoutStation[] = jsonStations.map((s) => ({
    id: s.id,
    name: hEn(s.name),
    levels: (s.levels ?? []).map((l) => ({
      level: l.level,
      itemRequirements: (l.itemRequirements ?? []).map((r) => ({ item: itemRef(r.item), count: r.count })),
      stationLevelRequirements: (l.stationLevelRequirements ?? []).map((r) => ({
        station: { id: r.station, name: stationName.get(r.station) ?? r.station },
        level: r.level,
      })),
      // trader requirements are a general predicate list here — the loyalty
      // level lives in `value`, so keep only the level ones
      traderRequirements: (l.traderRequirements ?? [])
        .filter((r) => !r.requirementType || r.requirementType === 'level')
        .map((r) => ({ trader: { name: traderName(r.trader) }, level: r.value ?? 1 })),
      skillRequirements: (l.skillRequirements ?? []).map((r) => ({
        name: r.skill ?? r.name ?? '',
        level: r.level ?? r.value ?? 0,
      })),
    })),
  }))

  const barters: RawBarter[] = values<JsonBarter>(bartersRaw).map((b) => ({
    id: b.id,
    trader: { name: traderName(b.trader) },
    level: b.minTraderLevel,
    taskUnlock: b.taskUnlock
      ? { id: b.taskUnlock, name: tEn(`${b.taskUnlock} name`) }
      : null,
    requiredItems: (b.requiredItems ?? []).map(tradeItem),
    rewardItems: b.offeredItem ? [tradeItem(b.offeredItem)] : [],
  }))

  const crafts: RawCraft[] = values<JsonCraft>(craftsRaw).map((c) => ({
    id: c.id,
    station: { id: c.station, name: stationName.get(c.station) ?? c.station },
    level: c.level,
    duration: c.duration,
    requiredItems: (c.requiredItems ?? []).map(tradeItem),
    rewardItems: c.productItem ? [tradeItem(c.productItem)] : [],
  }))

  const maps: RawMap[] = values<JsonMap>(mapsRaw, 'maps').map((m) => ({
    name: mEn(`${m.id} Name`),
    normalizedName: m.normalizedName ?? '',
    locks: (m.locks ?? []).map((l) => ({
      lockType: l.lockType,
      needsPower: l.needsPower,
      key: l.key
        ? { ...itemRef(l.key), wikiLink: itemById.get(l.key)?.wikiLink ?? '' }
        : null,
    })),
  }))

  return {
    tasks,
    stations,
    ammo: ammoFromItems(items, iEn),
    barters,
    crafts,
    maps,
    stims: stimsFromItems(items, iEn),
  }
}

/**
 * JSON has no stim endpoint — effects live on the item's `properties`, same as
 * ammo. Returns null when nothing maps so the caller keeps whatever it had rather
 * than blanking the view (effect data barely moves between patches).
 *
 * `types` is ["injectors","meds","provisions"] on all of them with no 'stims'
 * entry, so propertiesType is the only reliable discriminator. GraphQL calls the
 * skill field `skillName`; JSON uses a bare `skill`, mapped here so RawStim is
 * identical from either source.
 */
function stimsFromItems(items: JsonItem[], iEn: (k: string) => string): RawStim[] | null {
  const rows: RawStim[] = []
  for (const i of items) {
    const p = i.properties
    if (!p || p.propertiesType !== 'ItemPropertiesStim') continue
    if (!Array.isArray(p.stimEffects)) continue
    const stimEffects: RawStimEffect[] = []
    for (const raw of p.stimEffects as Record<string, unknown>[]) {
      if (!raw || typeof raw.type !== 'string') continue
      stimEffects.push({
        type: raw.type,
        // default 1, not 0 — a missing chance must not silently zero the weighting
        chance: typeof raw.chance === 'number' ? raw.chance : 1,
        delay: typeof raw.delay === 'number' ? raw.delay : 0,
        duration: typeof raw.duration === 'number' ? raw.duration : 0,
        value: typeof raw.value === 'number' ? raw.value : 0,
        percent: raw.percent === true,
        skillName: typeof raw.skill === 'string' ? raw.skill : null,
      })
    }
    if (stimEffects.length === 0) continue
    rows.push({
      item: { id: i.id, name: iEn(`${i.id} Name`), shortName: iEn(`${i.id} ShortName`) },
      useTime: typeof p.useTime === 'number' ? p.useTime : null,
      cures: Array.isArray(p.cures)
        ? (p.cures as unknown[]).filter((c): c is string => typeof c === 'string')
        : [],
      stimEffects,
    })
  }
  return rows.length > 0 ? rows : null
}

/**
 * JSON has no ammo endpoint — ballistics live on the item's `properties`.
 * Returns null if nothing maps, so the caller can keep the previous ammo data
 * rather than blanking the view (ballistics barely change between patches).
 */
function ammoFromItems(items: JsonItem[], iEn: (k: string) => string): RawAmmo[] | null {
  const rows: RawAmmo[] = []
  for (const i of items) {
    const p = i.properties
    if (!p || p.propertiesType !== 'ItemPropertiesAmmo') continue
    if (typeof p.penetrationPower !== 'number' || typeof p.damage !== 'number') continue
    rows.push({
      item: { id: i.id, name: iEn(`${i.id} Name`), shortName: iEn(`${i.id} ShortName`) },
      caliber: typeof p.caliber === 'string' ? p.caliber : null,
      damage: p.damage,
      penetrationPower: p.penetrationPower,
      armorDamage: typeof p.armorDamage === 'number' ? p.armorDamage : 0,
      fragmentationChance: typeof p.fragmentationChance === 'number' ? p.fragmentationChance : 0,
      initialSpeed: typeof p.initialSpeed === 'number' ? p.initialSpeed : null,
      accuracyModifier: typeof p.accuracyModifier === 'number' ? p.accuracyModifier : null,
      recoilModifier: typeof p.recoilModifier === 'number' ? p.recoilModifier : null,
      tracer: p.tracer === true,
    })
  }
  return rows.length > 0 ? rows : null
}
