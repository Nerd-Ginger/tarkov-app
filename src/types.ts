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

/**
 * Where on a map an objective happens, in raw game-world coordinates.
 *
 * `x`/`z` are the ground plane and `y` is height — the map view plots x/z
 * directly against the map's world-space bounds, and uses y only to pick a
 * floor on multi-level maps. `outline` is the zone polygon when the API gives
 * one (an area to plant in, rather than a point to stand on).
 */
export interface ObjectiveLocation {
  /** Map id, not display name — the only stable key across aliased maps. */
  mapId: string
  x: number
  y: number
  z: number
  /** Zone polygon in the same world space. Empty for point locations. */
  outline: { x: number; z: number }[]
}

export interface QuestObjective {
  /** Stable objective id (from the API) — the key for tracked progress. */
  id: string
  description: string
  category: ObjectiveCategory
  /** Raw API type ('visit', 'plantItem', 'mark', …). `category` is the coarse bucket. */
  type: string
  maps: string[]
  /** Empty for the ~60% of objectives the API gives no position for. */
  locations: ObjectiveLocation[]
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
   * Prerequisite quest ids that completing satisfies. This is the chain
   * `activateQuest` walks to mark ancestors done — NOT the availability gate.
   * For that see `prereqs` / isBlocked, which also understands active and
   * failed prerequisites.
   */
  blockingRequires: string[]
  /**
   * Every prerequisite with the prereq states that satisfy it. The API models
   * this as a disjunction — `['complete','active']` means "done OR in progress".
   */
  prereqs: QuestPrereq[]
  /** Which PMC faction can take this quest. 'Any' for all but 12 quests. */
  faction: QuestFaction
  /** Trader loyalty / reputation gates. Annotated, never hidden — see filters. */
  traderReqs: QuestTraderReq[]
  /** Traders you must speak to first. JSON-only; absent on GraphQL loads. */
  dialogueWith: string[]
  /** Gated behind a prestige level (PvP only today). */
  prestige: boolean
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

/** Prereq states the API recognises. A requirement lists the ones that satisfy it. */
export type ReqStatus = 'complete' | 'active' | 'failed'

export interface QuestPrereq {
  id: string
  /** Never empty — a missing status array normalizes to ['complete']. */
  status: ReqStatus[]
}

export type QuestFaction = 'Any' | 'BEAR' | 'USEC'

export interface QuestTraderReq {
  trader: string
  kind: 'level' | 'reputation'
  /** '>=' | '>' | '<=' | '<' | '=' */
  compare: string
  value: number
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
  /**
   * Positional data. JSON-only — neither field is requested from GraphQL, so a
   * GraphQL-sourced load has no map positions at all. See normalize.ts.
   */
  zones?: RawZone[] | null
  possibleLocations?: { map: string; positions: RawPoint[] }[] | null
}

export interface RawPoint {
  x: number
  y: number
  z: number
}

export interface RawZone {
  /** Map id. */
  map: string
  position: RawPoint
  outline?: RawPoint[] | null
}

export interface RawTaskRequirement {
  task: { id: string }
  status: string[]
}

export interface RawTraderRequirement {
  /** 'level' (trader loyalty) or 'reputation'. Other types are ignored. */
  requirementType: string
  compareMethod: string
  value: number
  trader: { name: string }
}

/** JSON-only — this field doesn't exist on the GraphQL Task type. */
export interface RawOtherRequirement {
  type: string
  traders: { name: string }[]
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
  factionName?: string | null
  taskRequirements?: RawTaskRequirement[]
  traderRequirements?: RawTraderRequirement[] | null
  otherRequirements?: RawOtherRequirement[] | null
  /** JSON gives a bare prestige id; GraphQL would give an object. Presence is all we use. */
  requiredPrestige?: string | { id: string } | null
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

// ---- meds (stims, painkillers, buffed food) ----

/** Which family a med belongs to — drives the filter chips and the roles. */
export type MedKind = 'Stim' | 'Painkiller' | 'Food'

/**
 * One timed effect on a consumable. Source-independent on purpose: GraphQL exposes
 * the skill as `skillName` (alongside a `skill: Skill` object), the JSON API as a
 * bare `skill` string, so both readers flatten to `skillName` here.
 *
 * Painkillers and food don't ship a `stimEffects` array at all — their
 * painkillerDuration / energyImpact / hydration numbers are synthesised into this
 * same shape by the adapters, so everything downstream has one path.
 */
export interface RawStimEffect {
  type: string
  chance: number
  delay: number
  duration: number
  value: number
  percent: boolean
  skillName: string | null
}

/**
 * A stimulant injector. Unlike RawAmmo this isn't the literal GraphQL shape —
 * GraphQL returns it under Item.properties behind a union fragment, so each source
 * flattens to this once rather than leaking the unwrap into the normalizer.
 */
export interface RawStim {
  item: ItemRef
  kind: MedKind
  useTime: number | null
  cures: string[]
  stimEffects: RawStimEffect[]
  /** Doses per item — painkillers and balms carry several. */
  uses?: number | null
}

export type StimSign = 'buff' | 'debuff' | 'neutral'

export type StimRole =
  | 'Combat'
  | 'Detox'
  | 'Bleed control'
  | 'Pain relief'
  | 'Warmth'
  | 'Carry weight'
  | 'Stamina'
  | 'Healing'
  | 'Skills'
  | 'Nourishment'
  | 'Situational'

export interface StimEffect {
  /** Raw API type id: 'MaxStamina', 'Skill', 'HandsTremor'… */
  type: string
  /** Skill name for Skill effects ('Endurance'), '' otherwise. */
  skill: string
  /** Comparison identity — 'MaxStamina', or 'Skill:Endurance' for skill effects. */
  key: string
  /** Display label: 'Max stamina', 'Endurance skill'. */
  label: string
  sign: StimSign
  /** True when the API always ships value 0 for this type — show a marker, not a number. */
  presenceOnly: boolean
  value: number
  /** Raw API flag. Unreliable across items — kept for tooltips only. */
  percent: boolean
  chance: number
  delay: number
  duration: number
  /** delay + duration — when the effect stops. */
  endsAt: number
}

export interface Stim {
  id: string
  name: string
  shortName: string
  kind: MedKind
  useTime: number
  /** Doses per item (1 when the API doesn't say). */
  uses: number
  /** Display labels: 'Pain', 'Heavy bleeding'. */
  cures: string[]
  /** Raw cure ids, for the pairing logic. */
  curesRaw: string[]
  /** Chronological: delay asc, buffs before debuffs, then |value| desc. */
  effects: StimEffect[]
  buffs: number
  debuffs: number
  /** Latest endsAt across all effects. */
  duration: number
  /** First matching role rule. A sorting key, not a verdict. */
  role: StimRole
  /** Every qualifying role, primary first. */
  roles: StimRole[]
  /** Any effect with chance < 1. */
  random: boolean
  /** Effect keys this stim both buffs and debuffs — its own gain is later reversed. */
  selfReversed: string[]
}

export interface StimPairing {
  stimId: string
  name: string
  shortName: string
  kind: 'cancels' | 'minor' | 'overlaps' | 'complements'
  score: number
  /** One short human-readable phrase each, max 3. */
  reasons: string[]
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

/**
 * Which upstream served a cached dataset. GraphQL is primary; 'json' means
 * tarkov.dev's GraphQL VPS was unreachable and the JSON API answered instead.
 */
export type DataSource = 'graphql' | 'json'

/**
 * Which game mode the whole app tracks — quests, prices, hideout, the lot.
 * `regular` is the API's name for PvP.
 *
 * The two modes are separate economies AND separate quest sets, though 483 of
 * ~510 quests are shared; the differences are all Arena ([PVE ZONE] vs
 * [PVP ZONE] variants). Progress is keyed by quest id, so switching keeps it.
 */
export type GameMode = 'pve' | 'regular'

/** @deprecated Historical alias from when only prices switched. Use GameMode. */
export type PriceMode = GameMode

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
  /**
   * Every trader that buys this item, best-paying first (flea excluded).
   * Sources are display-cased ("Prapor") unlike `traderName`, which stays raw
   * for back-compat. Trader sell offers are never loyalty-gated, so no level.
   */
  sellTo: { source: string; price: number }[]
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
  /**
   * Map id. Objective zones reference maps by id, and display names are aliased
   * many-to-one ('Night Factory' → 'Factory'), so this is the only key that can
   * bridge the two. Optional because caches written before the map view existed
   * don't carry it.
   */
  id?: string
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
  /**
   * Trader name → unlocked, for traders you don't start with. Only consulted
   * for traders no quest reward unlocks (Lightkeeper); Jaeger and Ref are
   * derived from completed quests instead.
   */
  unlockedTraders: Record<string, boolean>
  /** PMC faction. 'Any' means don't gate — 12 quests are BEAR- or USEC-only. */
  faction: QuestFaction
  /**
   * Trader name → standing. Only Fence and Lightkeeper gate anything, and only
   * as an annotation. A missing key means "unset" — 0 can't stand in for that,
   * since three Make Amends quests genuinely gate on `<= 0`.
   */
  reputation: Record<string, number>
}
