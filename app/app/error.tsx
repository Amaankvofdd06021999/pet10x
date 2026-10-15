"use client"

/**
 * Shown when a screen's code fails to download (offline on first open, a stale
 * deploy). Without this the lazy screen's failure would reach the framework's
 * default page instead of something the resident can act on.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-[15px] font-semibold">Could not load this screen</p>
      <p className="text-[13px] text-muted-foreground">Check your connection and try again.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-xl bg-primary px-4 py-2 text-[14px] font-semibold text-primary-foreground"
      >
        Try again
      </button>
    </div>
  )
}
