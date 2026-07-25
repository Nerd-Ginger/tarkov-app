/** Deadline for GraphQL calls — past this we stop waiting and try the JSON fallback. */
export const GRAPHQL_TIMEOUT_MS = 12_000

/** Readable reason from a caught value, for the combined both-sources-failed error. */
export function describe(e: unknown): string {
  if (e === undefined) return 'skipped'
  return e instanceof Error ? e.message : String(e)
}
