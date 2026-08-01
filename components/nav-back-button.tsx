"use client"

import { ArrowLeft } from "lucide-react"

/**
 * The leading affordance for a compact nav bar.
 *
 * Shared so the tab-root screens (community, services, profile) and the
 * pushed screens (chat, pet detail) present the same target and the same
 * optical alignment — the `-ml-2` pulls the glyph's padding back to the
 * screen margin so it lines up with the content below it, not 8px inside.
 */
export function NavBackButton({ onClick, label = "Back" }: { onClick?: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="-ml-2 flex items-center p-2 text-primary transition-transform active:scale-95"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  )
}
