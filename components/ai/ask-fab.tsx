"use client"

import { Sparkles } from "lucide-react"

/**
 * Mobile entry point to the assistant.
 *
 * The owner tab bar already carries five tabs, which is the sensible mobile
 * maximum — so this floats above the bar rather than becoming a sixth tab.
 * Desktop uses the sidebar item instead, hence `md:hidden`.
 */
export function AskFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Ask the Pet10x assistant"
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent shadow-lg shadow-accent/30 transition-transform active:scale-95 md:hidden"
    >
      <Sparkles className="h-6 w-6 text-accent-foreground" strokeWidth={2.2} />
    </button>
  )
}
