import { ANY_MAP, ARENA, MAP_UNKNOWN, NO_RAID } from '../types'
import type { ObjectiveCategory, Quest, RawTask } from '../types'

/** Map variants that are the same physical location for quest purposes. */
const MAP_ALIASES: Record<string, string> = {
  'Ground Zero 21+': 'Ground Zero',
  'Night Factory': 'Factory',
}

/** Seasonal/event maps — shown, but tagged so they don't read as core maps. */
export const EVENT_MAPS = new Set(['Icebreaker', 'The Labyrinth'])

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
  ANY_MAP,
  NO_RAID,
  ARENA,
  MAP_UNKNOWN,
  'Icebreaker',
  'The Labyrinth',
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

export function normalizeTasks(tasks: RawTask[]): Quest[] {
  const quests = tasks.map((t) => {
    const objectives = t.objectives.map((o) => ({
      description: o.description,
      category: CATEGORY_BY_TYPE[o.type] ?? ('Other' as ObjectiveCategory),
      maps: [...new Set((o.maps ?? []).map((m) => normalizeMapName(m.name)))],
      optional: o.optional,
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
      arena: isArenaQuest(t),
      wikiLink: t.wikiLink,
      maps: [...mapSet].sort((a, b) => mapSortKey(a) - mapSortKey(b)),
      categories,
      objectives,
    }
  })

  quests.sort(
    (a, b) =>
      traderSortKey(a.trader) - traderSortKey(b.trader) ||
      a.minLevel - b.minLevel ||
      a.name.localeCompare(b.name),
  )
  return quests
}
