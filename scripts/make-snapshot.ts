/**
 * Regenerate src/data/snapshot.json — the bundled PvE fallback the app ships
 * with, used on a first run with no cache and as the merge base for a partial
 * payload.
 *
 * Deliberately runs the app's own `tasksFromJson` rather than re-deriving the
 * shape here: the snapshot is cast straight to TaskCache at import, so any
 * drift between this script and the live pipeline would surface as a runtime
 * shape mismatch that TypeScript can't catch.
 *
 * Run with:  node --experimental-strip-types scripts/make-snapshot.ts
 */
import { writeFileSync } from 'node:fs'
import { tasksFromJson } from '../src/api/jsonFallback.ts'

const OUT = new URL('../src/data/snapshot.json', import.meta.url)

const data = await tasksFromJson('pve')

if (data.tasks.length === 0) throw new Error('refusing to write an empty snapshot')

const snapshot = {
  fetchedAt: Date.now(),
  tasks: data.tasks,
  stations: data.stations,
  ammo: data.ammo ?? [],
  barters: data.barters,
  crafts: data.crafts,
  maps: data.maps,
  stims: data.stims ?? [],
}

writeFileSync(OUT, JSON.stringify(snapshot))

const rewards = (f: string) =>
  snapshot.tasks.filter((t) => (t.finishRewards as Record<string, unknown[]> | null)?.[f]?.length)
    .length

console.log(
  JSON.stringify(
    {
      tasks: snapshot.tasks.length,
      stations: snapshot.stations.length,
      ammo: snapshot.ammo.length,
      barters: snapshot.barters.length,
      crafts: snapshot.crafts.length,
      maps: snapshot.maps.length,
      stims: snapshot.stims.length,
      offerUnlock: rewards('offerUnlock'),
      traderUnlock: rewards('traderUnlock'),
      skillLevelReward: rewards('skillLevelReward'),
      faction: snapshot.tasks.filter((t) => t.factionName && t.factionName !== 'Any').length,
      traderReqs: snapshot.tasks.filter((t) => t.traderRequirements?.length).length,
    },
    null,
    1,
  ),
)
