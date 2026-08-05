/**
 * Shown when a dataset came from tarkov.dev's GraphQL API instead of their JSON
 * endpoints — i.e. JSON was unreachable and we fell back.
 *
 * This used to mean the opposite. JSON is the primary source now, so a
 * json-sourced dataset is the normal case and gets no tag at all; GraphQL is
 * the one worth flagging, since it can't supply the dialogue requirements and
 * has been the less reliable half.
 */
export function BackupApiTag() {
  return (
    <em
      className="backup-api"
      title="tarkov.dev's JSON API was unreachable, so this came from their GraphQL server instead. The data is good, but a few quest requirements aren't available from that source. It refreshes back automatically."
    >
      {' '}
      · via backup API
    </em>
  )
}
