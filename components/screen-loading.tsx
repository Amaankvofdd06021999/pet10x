/**
 * Placeholder shown while a screen's code downloads on first open.
 *
 * Kept free of imports from the screen layer on purpose: this renders from the
 * /app entry chunk, so anything it pulls in would land back in the first
 * download that lazy loading exists to shrink.
 */
export function ScreenLoading() {
  return (
    <div className="flex flex-col gap-2 p-4" role="status" aria-label="Loading">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-secondary" aria-hidden="true" />
      ))}
    </div>
  )
}
