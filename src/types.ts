export const ANY_MAP = 'Any map'
export const ARENA = 'Arena'
export const MAP_UNKNOWN = 'Map unknown'
export const NO_RAID = 'No raid needed'

export const CATEGORIES = [
  'Kill',
  'Plant/Mark',
  'Collect',
  'Visit',
  'Extract',
  'Build',
  'Other',
] as const

export type ObjectiveCategory = (typeof CATEGORIES)[number]

export interface ItemRef {
  id: string
  name: string
  shortName: string
}

export interface QuestObjective {
  /** Stable objective id (from the API) — the key for tracked progress. */
  id: string
  description: string
  category: ObjectiveCategory
  maps: string[]
  optional: boolean
  /** Item + count for hand-in/find objectives (giveItem, findItem, plantItem, sellItem). */
  item: ItemRef | null
  count: number
  foundInRaid: boolean
  /**
   * True for objective types that consume items (giveItem/plantItem/sellItem).
   * findItem is the acquisition step of the same items, so it never counts —
   * otherwise quests like Shortage would double-count (find 3 + give 3 = 6).
   */
  handIn: boolean
}

export interface Quest {
  id: string
  name: string
  trader: string
  minLevel: number
  kappa: boolean
  /** On the path to unlock Lightkeeper (tarkov.dev lightkeeperRequired). */
  lightkeeper: boolean
  /** True for the Arena questline ([PVE ZONE] / [PVP ZONE]) — hidden until the Arena toggle is on. */
  arena: boolean
  wikiLink: string
  /** Normalized map names; a pseudo-map (Any map / Arena / Map unknown / No raid needed) when the quest has no bound map. */
  maps: string[]
  categories: ObjectiveCategory[]
  objectives: QuestObjective[]
  /** Questline/arc name (text before the first " - "), when the quest is part of a multi-quest series; else null. */
  series: string | null
  /** All prerequisite quest ids (used to draw the progression flow chart). */
  requires: string[]
  /**
   * Prerequisite quest ids that must be *completed* to unlock this quest. A
   * subset of `requires` — excludes the handful of quests that unlock by
   * *failing* a prior quest, which we can't represent and shouldn't hide.
   */
  blockingRequires: string[]
  /** Completion XP. */
  xp: number
  /** Items handed out on completion (includes Roubles). */
  rewardItems: { item: ItemRef; count: number }[]
  /** Trader reputation gained on completion. */
  rewardStanding: { trader: string; standing: number }[]
  /** Trader offers this quest unlocks for purchase (item + trader loyalty level). */
  rewardOffers: { item: ItemRef; trader: string; level: number }[]
  /** Traders this quest unlocks outright (rare — Jaeger, Lightkeeper). */
  rewardTraderUnlocks: string[]
  /** Skill levels granted on completion. */
  rewardSkills: { name: string; level: number }[]
}

export interface RawObjective {
  id: string
  type: string
  description: string
  optional: boolean
  maps: { name: string }[] | null
  /** Present only on item objectives (giveItem/findItem); true when the item must be found in raid. */
  foundInRaid?: boolean | null
  /** Present only on item objectives. */
  item?: ItemRef | null
  count?: number | null
}

export interface RawTaskRequirement {
  task: { id: string }
  status: string[]
}

export interface RawTask {
  id: string
  name: string
  minPlayerLevel: number
  kappaRequired: boolean
  lightkeeperRequired?: boolean
  wikiLink: string
  experience?: number
  trader: { name: string } | null
  map: { name: string } | null
  taskRequirements?: RawTaskRequirement[]
  objectives: RawObjective[]
  finishRewards?: {
    items: { item: ItemRef; count: number }[]
    traderStanding: { trader: { name: string }; standing: number }[]
    offerUnlock?: { item: ItemRef; trader: { name: string }; level: number }[] | null
    traderUnlock?: { name: string }[] | null
    skillLevelReward?: { name: string; level: number }[] | null
  } | null
}

// ---- hideout ----

export interface RawItemRequirement {
  item: ItemRef
  count: number
}

export interface RawStationLevel {
  level: number
  itemRequirements: RawItemRequirement[]
  stationLevelRequirements: { station: { id: string; name: string }; level: number }[]
  traderRequirements: { trader: { name: string }; level: number }[]
  skillRequirements: { name: string; level: number }[]
}

export interface RawHideoutStation {
  id: string
  name: string
  levels: RawStationLevel[]
}

/** One buildable hideout station level, normalized. Key is `${stationId}:${level}`. */
export interface StationLevel {
  key: string
  stationId: string
  stationName: string
  level: number
  items: RawItemRequirement[]
  stationPrereqs: { stationId: string; stationName: string; level: number }[]
  traderReqs: { trader: string; level: number }[]
  skillReqs: { name: string; level: number }[]
}

// ---- ammo ----

export interface RawAmmo {
  item: ItemRef
  caliber: string | null
  damage: number
  penetrationPower: number
  armorDamage: number
  fragmentationChance: number
  initialSpeed: number | null
  accuracyModifier: number | null
  recoilModifier: number | null
  tracer: boolean
}

export interface Ammo {
  id: string
  name: string
  shortName: string
  /** Human-readable caliber ("5.56x45 NATO"), also the grouping key. */
  caliber: string
  damage: number
  pen: number
  armorDamage: number
  fragChance: number
  velocity: number
  accuracy: number
  recoil: number
  tracer: boolean
}

// ---- barters & crafts ----

export interface RawTradeItem {
  item: ItemRef & { types?: string[] | null }
  count: number
}

export interface RawBarter {
  id: string
  trader: { name: string }
  level: number
  taskUnlock: { id: string; name: string } | null
  requiredItems: RawTradeItem[]
  rewardItems: RawTradeItem[]
}

export interface RawCraft {
  id: string
  station: { id: string; name: string }
  level: number
  duration: number
  requiredItems: RawTradeItem[]
  rewardItems: RawTradeItem[]
}

export interface TradeItem {
  item: ItemRef
  count: number
  /** Item is banned from flea market — must be found in raid (or bartered/crafted). */
  noFlea: boolean
}

export interface Barter {
  id: string
  trader: string
  /** Trader loyalty level required (LL1–LL4). */
  level: number
  unlockQuest: { id: string; name: string } | null
  required: TradeItem[]
  reward: TradeItem[]
  /** Any required item is flea-banned → you need in-raid finds. */
  fir: boolean
}

export interface Craft {
  id: string
  stationId: string
  station: string
  /** Station level required. */
  level: number
  durationSec: number
  required: TradeItem[]
  reward: TradeItem[]
  /** Any required item is flea-banned → you need in-raid finds. */
  fir: boolean
}

// ---- flea prices ----

/** Trimmed live price row (cached ~1h; never bundled in the snapshot). */
export interface PriceRow {
  id: string
  name: string
  shortName: string
  /** Flea average 24h price (₽), null when flea-banned or never listed. */
  flea: number | null
  /** Most recent lowest flea listing (₽). */
  lastLow: number | null
  /** 48h price change in percent. */
  change48h: number | null
  /** Best trader sell price, normalized to roubles (0 = no trader buys it). */
  trader: number
  traderName: string
  noFlea: boolean
  /** Grid slots (width × height), min 1 — for price-per-slot. */
  slots: number
  /** Where you can buy it, cheapest first. minLevel 0 = flea/no loyalty gate. */
  buyFrom: { source: string; price: number; minLevel: number }[]
}

// ---- keys / locks ----

export interface RawLock {
  lockType: string
  needsPower: boolean
  key: { id: string; name: string; shortName: string; wikiLink: string } | null
}

export interface RawMap {
  name: string
  normalizedName: string
  locks: RawLock[] | null
}

/** One key→lock relationship on a map. */
export interface KeyLock {
  map: string
  /** tarkov.dev interactive-map slug for the base map (e.g. "reserve"). */
  mapSlug: string
  keyId: string
  keyName: string
  keyShort: string
  keyWiki: string
  /** door | trunk | container | switch */
  lockType: string
  needsPower: boolean
}

// ---- intel (trader resets, goons, boss spawns) ----

export interface TraderReset {
  name: string
  /** Next restock time in ms epoch. */
  resetAt: number
}

export interface GoonReport {
  map: string
  /** Last-seen time in ms epoch. */
  seenAt: number
}

export interface BossEscort {
  name: string
  /** Smallest / largest group size that can spawn (identical when fixed). */
  min: number
  max: number
}

export interface MapBosses {
  map: string
  bosses: { name: string; chance: number; escorts: BossEscort[] }[]
}

export interface Intel {
  traderResets: TraderReset[]
  goonReports: GoonReport[]
  bossSpawns: MapBosses[]
}

// ---- profile ----

export interface Profile {
  /** PMC character level (0 = unset). */
  pmcLevel: number
  /** Trader name → loyalty level you've reached (1–4). Missing = LL1. */
  traders: Record<string, number>
}
