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

export interface QuestObjective {
  description: string
  category: ObjectiveCategory
  maps: string[]
  optional: boolean
}

export interface Quest {
  id: string
  name: string
  trader: string
  minLevel: number
  kappa: boolean
  /** True for the Arena questline ([PVE ZONE] / [PVP ZONE]) — hidden until the Arena toggle is on. */
  arena: boolean
  wikiLink: string
  /** Normalized map names; a pseudo-map (Any map / Arena / Map unknown / No raid needed) when the quest has no bound map. */
  maps: string[]
  categories: ObjectiveCategory[]
  objectives: QuestObjective[]
}

export interface RawObjective {
  type: string
  description: string
  optional: boolean
  maps: { name: string }[] | null
  /** Present only on item objectives (giveItem/findItem); true when the item must be found in raid. */
  foundInRaid?: boolean | null
}

export interface RawTask {
  id: string
  name: string
  minPlayerLevel: number
  kappaRequired: boolean
  wikiLink: string
  trader: { name: string } | null
  map: { name: string } | null
  objectives: RawObjective[]
}
