import { ANY_MAP, ARENA, MAP_UNKNOWN, NO_RAID } from '../types'
import type {
  Ammo,
  Barter,
  Craft,
  KeyLock,
  ObjectiveCategory,
  Quest,
  RawAmmo,
  RawBarter,
  RawCraft,
  RawHideoutStation,
  RawMap,
  RawTask,
  RawTradeItem,
  StationLevel,
  TradeItem,
} from '../types'

/** Map variants that are the same physical location for quest purposes. */
const MAP_ALIASES: Record<string, string> = {
  'Ground Zero 21+': 'Ground Zero',
  'Night Factory': 'Factory',
}

/**
 * Seasonal/event maps — shown, but tagged so they don't read as core maps.
 * "The Lab (Dark)" is the Blackout-event darkened Lab variant. (Terminal is a
 * permanent new map, so it's a normal entry in MAP_ORDER, NOT tagged event.)
 */
export const EVENT_MAPS = new Set(['Icebreaker', 'The Labyrinth', 'The Lab (Dark)'])

/**
 * Buckets for quests with no specific map. These are NOT real maps — the point is
 * to avoid the game's misleading "any location" catch-all. A quest only lands in
 * ANY_MAP when it is genuinely doable anywhere; anything tied to a place it can't
 * name goes to MAP_UNKNOWN instead of being falsely called "Any map".
 */
export const PSEUDO_MAPS: Record<string, { blurb: string; tone: 'neutral' | 'warn' }> = {
  [ANY_MAP]: {
    blurb: 'Truly any map — kills, find-in-raid, or found-in-raid hand-ins with no fixed location.',
    tone: 'neutral',
  },
  [ARENA]: {
    blurb: 'Arena questline — completed in Arena mode, not the open-world maps.',
    tone: 'neutral',
  },
  [MAP_UNKNOWN]: {
    blurb: 'Tied to a specific location the data source didn’t name — check the wiki before assuming any map.',
    tone: 'warn',
  },
  [NO_RAID]: {
    blurb: 'No raid needed — hand-ins, weapon builds, and trader tasks.',
    tone: 'neutral',
  },
}

const MAP_ORDER = [
  'Ground Zero',
  'Factory',
  'Customs',
  'Woods',
  'Shoreline',
  'Interchange',
  'Reserve',
  'Lighthouse',
  'Streets of Tarkov',
  'The Lab',
  'Terminal',
  ANY_MAP,
  NO_RAID,
  ARENA,
  MAP_UNKNOWN,
  'Icebreaker',
  'The Labyrinth',
  'The Lab (Dark)',
]

export function mapSortKey(name: string): number {
  const i = MAP_ORDER.indexOf(name)
  return i === -1 ? MAP_ORDER.length : i
}

export function isPseudoMap(name: string): boolean {
  return name in PSEUDO_MAPS
}

const TRADER_ORDER = [
  'Prapor',
  'Therapist',
  'Skier',
  'Peacekeeper',
  'Mechanic',
  'Ragman',
  'Jaeger',
  'Fence',
  'Ref',
  'Lightkeeper',
  'BTR Driver',
]

export function traderSortKey(name: string): number {
  const i = TRADER_ORDER.indexOf(name)
  return i === -1 ? TRADER_ORDER.length : i
}

const CATEGORY_BY_TYPE: Record<string, ObjectiveCategory> = {
  shoot: 'Kill',
  plantItem: 'Plant/Mark',
  plantQuestItem: 'Plant/Mark',
  mark: 'Plant/Mark',
  findItem: 'Collect',
  findQuestItem: 'Collect',
  giveItem: 'Collect',
  giveQuestItem: 'Collect',
  sellItem: 'Collect',
  visit: 'Visit',
  extract: 'Extract',
  buildWeapon: 'Build',
}

/**
 * Objective types that imply a *specific* place. If a map-less quest requires one
 * of these, we must not claim "Any map" — the location just wasn't in the data, so
 * it goes to MAP_UNKNOWN.
 */
const LOCATED_TYPES = new Set([
  'visit',
  'extract',
  'mark',
  'plantItem',
  'plantQuestItem',
  'findQuestItem',
  'useItem',
])

/** Objective types that are genuinely location-agnostic — doable on whatever map you run. */
const ANYWHERE_TYPES = new Set(['shoot', 'findItem'])

/** Objective types that consume items from your stash when the quest is turned in. */
const HAND_IN_TYPES = new Set(['giveItem', 'plantItem', 'sellItem'])

/**
 * Arena questline quests carry a "ZONE]" name tag ([PVE ZONE] in PvE, [PVP ZONE] in
 * regular). Their map-less objectives ("win a match in Arena") are typed `visit`, so
 * without this check they'd wrongly land in MAP_UNKNOWN; instead they get the ARENA
 * bucket. Arena quests that DO have real map objectives are handled upstream and show
 * under those maps — this only affects the map-less ones.
 */
export function isArenaQuest(t: RawTask): boolean {
  return /ZONE\]/.test(t.name)
}

/**
 * Decide the pseudo-map for a quest that has no real map. Order matters: Arena first,
 * then anything location-specific-but-unnamed (MAP_UNKNOWN), then genuinely-anywhere
 * raid work (ANY_MAP), and finally tasks that need no raid at all (NO_RAID).
 */
function classifyMapless(t: RawTask): string {
  if (isArenaQuest(t)) return ARENA
  const required = t.objectives.filter((o) => !o.optional)
  if (required.some((o) => LOCATED_TYPES.has(o.type))) return MAP_UNKNOWN
  const anywhere = required.some(
    (o) => ANYWHERE_TYPES.has(o.type) || o.foundInRaid === true,
  )
  return anywhere ? ANY_MAP : NO_RAID
}

function normalizeMapName(name: string): string {
  return MAP_ALIASES[name] ?? name
}

/** Arc name = text before the first " - " ("The Punisher - Part 3" → "The Punisher"). */
function seriesBase(name: string): string | null {
  const i = name.indexOf(' - ')
  return i === -1 ? null : name.slice(0, i).trim()
}

export function normalizeTasks(tasks: RawTask[]): Quest[] {
  // null slots appear when a per-task resolver fails server-side — skip them
  const quests = tasks.filter((t): t is RawTask => t != null).map((t) => {
    const objectives = t.objectives.map((o) => ({
      id: o.id,
      description: o.description,
      category: CATEGORY_BY_TYPE[o.type] ?? ('Other' as ObjectiveCategory),
      maps: [...new Set((o.maps ?? []).map((m) => normalizeMapName(m.name)))],
      optional: o.optional,
      item: o.item ?? null,
      count: o.count ?? 0,
      foundInRaid: o.foundInRaid === true,
      handIn: HAND_IN_TYPES.has(o.type),
    }))

    const mapSet = new Set<string>()
    for (const o of objectives) for (const m of o.maps) mapSet.add(m)
    if (mapSet.size === 0 && t.map) mapSet.add(normalizeMapName(t.map.name))

    if (mapSet.size === 0) mapSet.add(classifyMapless(t))

    const categories = [...new Set(objectives.filter((o) => !o.optional).map((o) => o.category))]
    if (categories.length === 0) categories.push(...new Set(objectives.map((o) => o.category)))

    return {
      id: t.id,
      name: t.name,
      trader: t.trader?.name ?? 'Unknown',
      minLevel: t.minPlayerLevel,
      kappa: t.kappaRequired,
      lightkeeper: t.lightkeeperRequired === true,
      arena: isArenaQuest(t),
      wikiLink: t.wikiLink,
      maps: [...mapSet].sort((a, b) => mapSortKey(a) - mapSortKey(b)),
      categories,
      objectives,
      series: seriesBase(t.name),
      xp: t.experience ?? 0,
      rewardItems: t.finishRewards?.items ?? [],
      rewardStanding: (t.finishRewards?.traderStanding ?? []).map((s) => ({
        trader: s.trader.name,
        standing: s.standing,
      })),
      requires: (t.taskRequirements ?? []).map((r) => r.task.id),
      blockingRequires: (t.taskRequirements ?? [])
        .filter((r) => (r.status ?? ['complete']).includes('complete'))
        .map((r) => r.task.id),
    }
  })

  // A prefix is only an arc if 2+ quests share it — drop lone "X - Y" names.
  const seriesCounts = new Map<string, number>()
  for (const q of quests) {
    if (q.series) seriesCounts.set(q.series, (seriesCounts.get(q.series) ?? 0) + 1)
  }
  for (const q of quests) {
    if (q.series && (seriesCounts.get(q.series) ?? 0) < 2) q.series = null
  }

  quests.sort(
    (a, b) =>
      traderSortKey(a.trader) - traderSortKey(b.trader) ||
      a.minLevel - b.minLevel ||
      a.name.localeCompare(b.name),
  )
  return quests
}

export function stationLevelKey(stationId: string, level: number): string {
  return `${stationId}:${level}`
}

export function normalizeStations(stations: RawHideoutStation[]): StationLevel[] {
  const levels: StationLevel[] = []
  for (const s of stations) {
    for (const l of s.levels) {
      levels.push({
        key: stationLevelKey(s.id, l.level),
        stationId: s.id,
        stationName: s.name,
        level: l.level,
        items: l.itemRequirements ?? [],
        stationPrereqs: (l.stationLevelRequirements ?? []).map((r) => ({
          stationId: r.station.id,
          stationName: r.station.name,
          level: r.level,
        })),
        traderReqs: (l.traderRequirements ?? []).map((r) => ({ trader: r.trader.name, level: r.level })),
        skillReqs: l.skillRequirements ?? [],
      })
    }
  }
  levels.sort((a, b) => a.stationName.localeCompare(b.stationName) || a.level - b.level)
  return levels
}

// ---- ammo ----

/** API caliber ids → readable labels. Unknown ids fall back to the stripped raw id. */
const CALIBER_LABELS: Record<string, string> = {
  Caliber556x45NATO: '5.56x45 NATO',
  Caliber545x39: '5.45x39',
  Caliber762x39: '7.62x39',
  Caliber762x51: '7.62x51 NATO',
  Caliber762x54R: '7.62x54R',
  Caliber9x19PARA: '9x19 Para',
  Caliber9x18PM: '9x18 PM',
  Caliber9x21: '9x21',
  Caliber9x39: '9x39',
  Caliber1143x23ACP: '.45 ACP',
  Caliber46x30: '4.6x30 HK',
  Caliber57x28: '5.7x28 FN',
  Caliber762x25TT: '7.62x25 TT',
  Caliber366TKM: '.366 TKM',
  Caliber127x55: '12.7x55',
  Caliber86x70: '.338 Lapua',
  Caliber20g: '20/70 Gauge',
  Caliber12g: '12/70 Gauge',
  Caliber23x75: '23x75',
  Caliber40x46: '40x46 Grenade',
  Caliber26x75: '26x75 Flare',
  Caliber40mmRU: '40mm RU Grenade',
  Caliber68x51: '6.8x51 SIG',
  Caliber9x33R: '.357 Magnum',
  Caliber50BMG: '.50 BMG',
}

function caliberLabel(raw: string | null): string {
  if (!raw) return 'Unknown'
  return CALIBER_LABELS[raw] ?? raw.replace(/^Caliber/, '')
}

export function normalizeAmmo(ammo: RawAmmo[]): Ammo[] {
  const rows = ammo.map((a) => ({
    id: a.item.id,
    name: a.item.name,
    shortName: a.item.shortName,
    caliber: caliberLabel(a.caliber),
    damage: a.damage,
    pen: a.penetrationPower,
    armorDamage: a.armorDamage,
    fragChance: a.fragmentationChance,
    velocity: a.initialSpeed ?? 0,
    accuracy: a.accuracyModifier ?? 0,
    recoil: a.recoilModifier ?? 0,
    tracer: a.tracer,
  }))
  rows.sort((a, b) => a.caliber.localeCompare(b.caliber) || b.pen - a.pen)
  return rows
}

// ---- barters & crafts ----

function normalizeTradeItems(items: RawTradeItem[]): TradeItem[] {
  return items.map((r) => ({
    item: { id: r.item.id, name: r.item.name, shortName: r.item.shortName },
    count: r.count,
    noFlea: (r.item.types ?? []).includes('noFlea'),
  }))
}

export function normalizeBarters(barters: RawBarter[]): Barter[] {
  const rows = barters.map((b) => {
    const required = normalizeTradeItems(b.requiredItems)
    return {
      id: b.id,
      trader: b.trader.name,
      level: b.level,
      unlockQuest: b.taskUnlock,
      required,
      reward: normalizeTradeItems(b.rewardItems),
      fir: required.some((r) => r.noFlea),
    }
  })
  rows.sort(
    (a, b) =>
      traderSortKey(a.trader) - traderSortKey(b.trader) ||
      a.level - b.level ||
      (a.reward[0]?.item.name ?? '').localeCompare(b.reward[0]?.item.name ?? ''),
  )
  return rows
}

export function normalizeCrafts(crafts: RawCraft[]): Craft[] {
  const rows = crafts.map((c) => {
    const required = normalizeTradeItems(c.requiredItems)
    return {
      id: c.id,
      stationId: c.station.id,
      station: c.station.name,
      level: c.level,
      durationSec: c.duration,
      required,
      reward: normalizeTradeItems(c.rewardItems),
      fir: required.some((r) => r.noFlea),
    }
  })
  rows.sort(
    (a, b) =>
      a.station.localeCompare(b.station) ||
      a.level - b.level ||
      (a.reward[0]?.item.name ?? '').localeCompare(b.reward[0]?.item.name ?? ''),
  )
  return rows
}

// ---- keys / locks ----

/**
 * Flatten every map's locks into key→lock rows, merging map variants (Night
 * Factory → Factory, etc.) so a key's doors group under one map name.
 */
export function normalizeKeys(maps: RawMap[]): KeyLock[] {
  const out: KeyLock[] = []
  for (const m of maps) {
    const map = normalizeMapName(m.name)
    for (const l of m.locks ?? []) {
      if (!l.key) continue
      out.push({
        map,
        keyId: l.key.id,
        keyName: l.key.name,
        keyShort: l.key.shortName,
        keyWiki: l.key.wikiLink,
        lockType: l.lockType,
        needsPower: l.needsPower,
      })
    }
  }
  return out
}
