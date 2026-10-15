/** True when a screen's code failed to download, as opposed to failing while it rendered. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === "ChunkLoadError" || /Loading chunk|Failed to fetch dynamically imported module/.test(error.message)
}
