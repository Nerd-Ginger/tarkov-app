import type { RawStim, Stim, StimEffect, StimPairing, StimRole, StimSign } from '../types'

/**
 * Stimulant classification, roles and pairing.
 *
 * Everything here is derived from the API's own effect data — which types a stim
 * applies, their sign, and what it cures. The API does NOT describe the game's
 * stacking rules, so nothing below claims to; pairings are effect-overlap maths,
 * surfaced with the reasoning attached so the user can judge them.
 */

/**
 * Effect types the API always ships with value 0 — the effect's *presence* is the
 * whole meaning, so the value cell shows a marker rather than a number. The map
 * value is the buff/debuff verdict.
 *
 * Naming is the tell: affliction-named types inflict the affliction, removal-named
 * types remove one.
 *
 * `Pain` is the one that reads ambiguously, since it also appears as a `cures`
 * value. It's an affliction here: SJ9 is the only stim carrying it, all five of
 * SJ9's effects are downsides, it cures nothing, and Pain arrives at delay 300s as
 * the tail. Reading it as a buff would also make the "cures the pain this inflicts"
 * pairing unreachable, since nothing would ever be recorded as inflicting it.
 */
const PRESENCE_ONLY: Record<string, StimSign> = {
  HandsTremor: 'debuff',
  QuantumTunnelling: 'debuff',
  Pain: 'debuff',
  Removeallbloodlosses: 'buff',
  Antidote: 'buff',
  // synthesised from a painkiller's painkillerDuration — the duration carries the
  // information, there is no magnitude
  PainRelief: 'buff',
}

/**
 * Types where the sign of `value` is the verdict. Polarity is explicit so a future
 * "higher is worse" type is a one-line change rather than a silent misread.
 */
const SIGNED_TYPES: Record<string, 1 | -1> = {
  Skill: 1,
  EnergyRate: 1,
  HealthRate: 1,
  HydrationRate: 1,
  StaminaRate: 1,
  MaxStamina: 1,
  WeightLimit: 1,
  BodyTemperature: 1,
  DamageModifier: 1,
  // one-off hits rather than rates: painkillers cost energy, food restores it
  EnergyImpact: 1,
  HydrationImpact: 1,
}

/** Instant one-off changes — shown without a time window, since they aren't rates. */
const INSTANT_TYPES = new Set(['EnergyImpact', 'HydrationImpact'])

export function isInstantType(type: string): boolean {
  return INSTANT_TYPES.has(type)
}

/**
 * Types whose value is a fraction meaning a multiplier, rendered as a percentage
 * from the magnitude alone. The API's own `percent` flag can't be trusted for this:
 * M.U.L.E. carries WeightLimit 0.5 with percent true (+50% in game) while Obdolbos
 * carries WeightLimit 0.1 with percent false (+10%) — same mechanic, opposite flag.
 */
const PERCENT_TYPES = new Set(['WeightLimit', 'DamageModifier'])

const EFFECT_LABELS: Record<string, string> = {
  MaxStamina: 'Max stamina',
  StaminaRate: 'Stamina rate',
  HealthRate: 'Health rate',
  EnergyRate: 'Energy rate',
  HydrationRate: 'Hydration rate',
  WeightLimit: 'Carry weight',
  BodyTemperature: 'Body temperature',
  DamageModifier: 'Damage',
  HandsTremor: 'Hands tremor',
  QuantumTunnelling: 'Quantum tunnelling',
  Removeallbloodlosses: 'Stops all bleeding',
  Antidote: 'Antidote',
  Pain: 'Pain',
  PainRelief: 'Pain relief',
  EnergyImpact: 'Energy',
  HydrationImpact: 'Hydration',
}

const CURE_LABELS: Record<string, string> = {
  Pain: 'Pain',
  Contusion: 'Contusion',
  HeavyBleeding: 'Heavy bleeding',
  LightBleeding: 'Light bleeding',
  Intoxication: 'Intoxication',
}

/** camelCase → spaced words, for ids the label maps don't know yet. */
function splitCamel(raw: string): string {
  const s = raw.replace(/([a-z])([A-Z])/g, '$1 $2')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function effectLabel(type: string, skill: string): string {
  // skill ids are camelCase too ('StressResistance' → 'Stress resistance')
  if (skill) return `${splitCamel(skill)} skill`
  return EFFECT_LABELS[type] ?? splitCamel(type)
}

export function cureLabel(raw: string): string {
  return CURE_LABELS[raw] ?? splitCamel(raw)
}

/** Label for a comparison key ('Skill:Endurance' → 'Endurance skill'). */
function keyLabel(key: string): string {
  const [type, skill] = key.split(':')
  return effectLabel(type, skill ?? '')
}

/**
 * Buff or debuff, and whether the API ships a meaningful number for it.
 * Unknown types (a future wipe adds one) fall back to the bare sign of the value,
 * so they render plausibly instead of vanishing.
 */
function classifyEffect(type: string, value: number): { sign: StimSign; presenceOnly: boolean } {
  const presence = PRESENCE_ONLY[type]
  if (presence) return { sign: presence, presenceOnly: true }
  const polarity = SIGNED_TYPES[type]
  if (polarity) {
    const v = polarity * value
    return { sign: v > 0 ? 'buff' : v < 0 ? 'debuff' : 'neutral', presenceOnly: false }
  }
  return {
    sign: value > 0 ? 'buff' : value < 0 ? 'debuff' : 'neutral',
    presenceOnly: value === 0,
  }
}

/** True when this effect type renders as a percentage. */
export function isPercentType(type: string): boolean {
  return PERCENT_TYPES.has(type)
}

/**
 * Role rules, ordered by how *rare* the triggering effect type is across the data
 * set — a rarer type is more distinctive of what the stim is for, so it takes the
 * primary slot. The order is hardcoded rather than computed from live counts: a
 * computed order would make a stim's role drift between patches.
 */
const ROLE_RULES: { role: StimRole; test: (effects: StimEffect[], cures: string[]) => boolean }[] = [
  { role: 'Combat', test: (e) => e.some((x) => x.type === 'DamageModifier' && x.sign === 'buff') },
  {
    role: 'Detox',
    test: (e, c) => e.some((x) => x.type === 'Antidote') || c.includes('Intoxication'),
  },
  {
    role: 'Bleed control',
    test: (e, c) => e.some((x) => x.type === 'Removeallbloodlosses') || c.some((x) => x.endsWith('Bleeding')),
  },
  {
    role: 'Pain relief',
    test: (e, c) => e.some((x) => x.type === 'PainRelief') || c.includes('Pain'),
  },
  { role: 'Warmth', test: (e) => e.some((x) => x.type === 'BodyTemperature' && x.sign === 'buff') },
  { role: 'Carry weight', test: (e) => e.some((x) => x.type === 'WeightLimit' && x.sign === 'buff') },
  {
    role: 'Stamina',
    test: (e) => e.some((x) => (x.type === 'MaxStamina' || x.type === 'StaminaRate') && x.sign === 'buff'),
  },
  { role: 'Healing', test: (e) => e.some((x) => x.type === 'HealthRate' && x.sign === 'buff') },
  { role: 'Skills', test: (e) => e.some((x) => x.type === 'Skill' && x.sign === 'buff') },
  {
    role: 'Nourishment',
    test: (e) =>
      e.some((x) => (x.type === 'EnergyImpact' || x.type === 'HydrationImpact') && x.sign === 'buff'),
  },
]

/** Display/sort order for roles — same order as the rules above. */
export const ROLE_ORDER: Record<StimRole, number> = {
  Combat: 0,
  Detox: 1,
  'Bleed control': 2,
  'Pain relief': 3,
  Warmth: 4,
  'Carry weight': 5,
  Stamina: 6,
  Healing: 7,
  Skills: 8,
  Nourishment: 9,
  Situational: 10,
}

const SIGN_ORDER: Record<StimSign, number> = { buff: 0, neutral: 1, debuff: 2 }

export function normalizeStims(raw: RawStim[]): Stim[] {
  const rows = raw.map((s): Stim => {
    const effects = (s.stimEffects ?? []).map((e): StimEffect => {
      const skill = e.skillName ?? ''
      const { sign, presenceOnly } = classifyEffect(e.type, e.value)
      return {
        type: e.type,
        skill,
        key: e.type === 'Skill' && skill ? `Skill:${skill}` : e.type,
        label: effectLabel(e.type, skill),
        sign,
        presenceOnly,
        value: e.value,
        percent: e.percent,
        chance: e.chance,
        delay: e.delay,
        duration: e.duration,
        endsAt: e.delay + e.duration,
      }
    })
    // chronological, buffs ahead of debuffs within the same moment
    effects.sort(
      (a, b) =>
        a.delay - b.delay ||
        SIGN_ORDER[a.sign] - SIGN_ORDER[b.sign] ||
        Math.abs(b.value) - Math.abs(a.value) ||
        a.label.localeCompare(b.label),
    )
    const curesRaw = s.cures ?? []
    const roles = ROLE_RULES.filter((r) => r.test(effects, curesRaw)).map((r) => r.role)
    // keys the stim both gives and takes away — without surfacing this, rows like
    // eTG-change read as self-contradictory
    const buffKeys = new Set(effects.filter((e) => e.sign === 'buff').map((e) => e.key))
    const selfReversed = [
      ...new Set(effects.filter((e) => e.sign === 'debuff' && buffKeys.has(e.key)).map((e) => e.key)),
    ]
    return {
      id: s.item.id,
      name: s.item.name,
      shortName: s.item.shortName,
      kind: s.kind,
      useTime: s.useTime ?? 0,
      uses: s.uses ?? 1,
      cures: curesRaw.map(cureLabel),
      curesRaw,
      effects,
      buffs: effects.filter((e) => e.sign === 'buff').length,
      debuffs: effects.filter((e) => e.sign === 'debuff').length,
      duration: effects.reduce((max, e) => Math.max(max, e.endsAt), 0),
      role: roles[0] ?? 'Situational',
      roles: roles.length > 0 ? roles : ['Situational'],
      random: effects.some((e) => e.chance < 1),
      selfReversed,
    }
  })
  rows.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name))
  return rows
}

// ---- pairing ----

interface StimSig {
  stim: Stim
  /** key → strongest buff at that key. */
  buff: Map<string, StimEffect>
  /** key → strongest debuff at that key. */
  debuff: Map<string, StimEffect>
  cures: Set<string>
  /** Conditions this stim causes — presence-only debuffs (Pain, HandsTremor…). */
  inflicts: Set<string>
  /** Probability-weighted upside/downside, so 25%-chance buffs don't count full. */
  upside: number
  downside: number
}

function strongest(into: Map<string, StimEffect>, e: StimEffect) {
  const prev = into.get(e.key)
  if (!prev || Math.abs(e.value) > Math.abs(prev.value) || (Math.abs(e.value) === Math.abs(prev.value) && e.chance > prev.chance)) {
    into.set(e.key, e)
  }
}

function signature(stim: Stim): StimSig {
  const buff = new Map<string, StimEffect>()
  const debuff = new Map<string, StimEffect>()
  const inflicts = new Set<string>()
  for (const e of stim.effects) {
    if (e.sign === 'buff') strongest(buff, e)
    else if (e.sign === 'debuff') {
      strongest(debuff, e)
      if (e.presenceOnly) inflicts.add(e.type)
    }
  }
  const weight = (m: Map<string, StimEffect>) => [...m.values()].reduce((sum, e) => sum + e.chance, 0)
  return {
    stim,
    buff,
    debuff,
    cures: new Set(stim.curesRaw),
    inflicts,
    upside: weight(buff),
    downside: weight(debuff),
  }
}

/** Conflicts below this are noise rather than a real cancel-out. */
const HARD_CANCEL = 0.5

/**
 * How much of the bigger value the opposing one eats, 0–1. Presence-only effects
 * have no magnitude, so an opposed pair is a full cancel. A `percent` mismatch
 * means the two numbers aren't on the same scale, so it's demoted below the hard
 * threshold rather than pretending they're comparable.
 */
function severity(a: StimEffect, b: StimEffect): number {
  if (a.presenceOnly || b.presenceOnly) return 1
  const x = Math.abs(a.value)
  const y = Math.abs(b.value)
  if (!x || !y) return 0
  const ratio = Math.min(x, y) / Math.max(x, y)
  return a.percent === b.percent ? ratio : Math.min(ratio, HARD_CANCEL - 0.01)
}

/**
 * For each stim, how every other stim relates to it.
 *
 * Deliberately ignores effect *timing*: the windows are relative to each stim's own
 * injection and the player picks when to inject, so intersecting them would be
 * false precision.
 */
export function buildStimPairings(stims: Stim[]): Map<string, StimPairing[]> {
  const sigs = stims.map(signature)
  const out = new Map<string, StimPairing[]>()

  for (const a of sigs) {
    const pairings: StimPairing[] = []
    for (const b of sigs) {
      if (a.stim.id === b.stim.id) continue

      // opposed: one buffs a key the other debuffs
      const conflicts: { key: string; sev: number }[] = []
      for (const [key, buff] of a.buff) {
        const opposed = b.debuff.get(key)
        if (opposed) conflicts.push({ key, sev: severity(buff, opposed) })
      }
      for (const [key, debuff] of a.debuff) {
        const opposed = b.buff.get(key)
        if (opposed) conflicts.push({ key, sev: severity(debuff, opposed) })
      }
      conflicts.sort((x, y) => y.sev - x.sev)

      const hard = conflicts.filter((c) => c.sev >= HARD_CANCEL)
      if (hard.length > 0) {
        pairings.push({
          stimId: b.stim.id,
          name: b.stim.name,
          shortName: b.stim.shortName,
          kind: 'cancels',
          score: hard[0].sev,
          reasons: hard.slice(0, 2).map((c) => `opposite ${keyLabel(c.key)} (${Math.round(c.sev * 100)}%)`),
        })
        continue
      }
      if (conflicts.length > 0) {
        pairings.push({
          stimId: b.stim.id,
          name: b.stim.name,
          shortName: b.stim.shortName,
          kind: 'minor',
          score: conflicts[0].sev,
          reasons: [`minor ${keyLabel(conflicts[0].key)} conflict`],
        })
        continue
      }

      // same key, same direction — the second one is wasted
      const sharedBuffs = [...a.buff.keys()].filter((k) => b.buff.has(k))
      const sharedDebuffs = [...a.debuff.keys()].filter((k) => b.debuff.has(k))
      if (sharedBuffs.length > 0 || sharedDebuffs.length > 0) {
        pairings.push({
          stimId: b.stim.id,
          name: b.stim.name,
          shortName: b.stim.shortName,
          kind: 'overlaps',
          score: 2 * sharedBuffs.length + sharedDebuffs.length,
          reasons: [
            ...sharedBuffs.slice(0, 2).map((k) => `both give ${keyLabel(k).toLowerCase()}`),
            ...sharedDebuffs.slice(0, 1).map((k) => `both cause ${keyLabel(k).toLowerCase()}`),
          ],
        })
        continue
      }

      // disjoint effects — genuinely complementary
      const fixes = [...b.cures].filter((c) => a.inflicts.has(c))
      const newRoles = b.stim.roles.filter((r) => !a.stim.roles.includes(r))
      const sharedCures = [...a.cures].filter((c) => b.cures.has(c))
      const reasons: string[] = []
      if (fixes.length > 0) reasons.push(`cures the ${fixes.map(cureLabel).join(', ')} this inflicts`)
      if (newRoles.length > 0) reasons.push(`adds ${newRoles.map((r) => r.toLowerCase()).join(', ')}`)
      if (reasons.length === 0) reasons.push('no shared effect types')
      if (sharedCures.length > 0) reasons.push(`both already cure ${sharedCures.map(cureLabel).join(', ')}`)
      pairings.push({
        stimId: b.stim.id,
        name: b.stim.name,
        shortName: b.stim.shortName,
        kind: 'complements',
        score: 3 * fixes.length + 2 * newRoles.length + b.upside - b.downside - sharedCures.length,
        reasons: reasons.slice(0, 3),
      })
    }
    pairings.sort(
      (x, y) => y.score - x.score || x.name.localeCompare(y.name),
    )
    out.set(a.stim.id, pairings)
  }
  return out
}
