"use client"

import { useEffect } from "react"
import { isChunkLoadError } from "@/lib/chunk-error"

/**
 * Shown when a screen fails to load or render. A failed download is cached by
 * the module system, so `reset()` alone would re-throw the same error: for that
 * case Try again reloads the page instead.
 */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  const download = isChunkLoadError(error)

  useEffect(() => {
    console.error("App screen error:", error)
  }, [error])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-[15px] font-semibold">{download ? "Couldn't load this screen." : "Something went wrong on this screen."}</p>
      <p className="text-[13px] text-muted-foreground">
        {download ? "Check your connection and try again." : "Try again."}
      </p>
      <button
        type="button"
        onClick={() => (download ? window.location.reload() : reset())}
        className="rounded-xl bg-primary px-4 py-2 text-[14px] font-semibold text-primary-foreground"
      >
        Try again
      </button>
    </div>
  )
}
