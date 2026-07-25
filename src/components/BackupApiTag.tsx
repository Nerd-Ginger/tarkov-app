/**
 * Shown when a dataset came from tarkov.dev's JSON API instead of GraphQL —
 * i.e. their GraphQL VPS was unreachable. The data is good, just sourced from
 * the backup, which explains small differences (a few missing quests, flea
 * prices derived from the last low offer).
 */
export function BackupApiTag() {
  return (
    <em
      className="backup-api"
      title="tarkov.dev's GraphQL server was unreachable, so this came from their JSON API. It refreshes back to the main source automatically."
    >
      {' '}
      · via backup API
    </em>
  )
}
