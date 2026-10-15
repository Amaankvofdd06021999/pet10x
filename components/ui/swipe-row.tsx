"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { swipeIntent } from "@/lib/swipe"

/*
 * A row that slides left to reveal its actions (spec §4).
 *
 * Touch: drag the row left; past half the reveal it snaps open, short of half
 * it springs back. Whether a drag is a swipe or the list scrolling is decided
 * once per touch by `swipeIntent` — scrolling wins anything ambiguous — and
 * `touch-action: pan-y` hands vertical movement to the browser, so a scroll
 * that starts on a row scrolls. A tap is still a tap: it reaches the row's
 * own click, unless a drag just happened or the row was open (then the tap
 * closes it).
 *
 * One row open at a time, through the module-level signal below. An open row
 * closes on a tap anywhere else, on any scroll, and on Escape.
 *
 * Mouse and keyboard: hovering the row (on a device that can hover) or
 * keyboard focus inside it slides it open the same way, so the actions are
 * the SAME buttons in the DOM — real `Button`s with visible labels, reached
 * by Tab — not a second copy for desktop. `:focus-visible`, not plain focus,
 * so a tap that focuses the row on a phone does not open it.
 *
 * Built on pointer events, no gesture library.
 */

/** How far the row slides to show its actions (two 72px buttons). */
const REVEAL = 144

/* "Which row is open" for every SwipeRow on the page. Opening one tells the
   rest, and they close. */
let openRow: string | null = null
const openListeners = new Set<(id: string | null) => void>()
function setOpenRow(id: string | null) {
  openRow = id
  openListeners.forEach((fn) => fn(id))
}

export interface SwipeAction {
  label: string
  icon: LucideIcon
  onPress: () => void
  /** `danger` for the destructive one; `default` is the brand fill. */
  tone?: "default" | "danger"
}

interface Drag {
  pointerId: number
  x: number
  y: number
  /** Offset when the finger landed: 0 closed, -REVEAL open. */
  from: number
  intent: "horizontal" | "vertical" | "undecided"
}

export function SwipeRow({
  actions,
  onOpenChange,
  className,
  children,
}: {
  actions: SwipeAction[]
  onOpenChange?: (open: boolean) => void
  /** The row's shape (radius, border or shadow). The content gets the card fill. */
  className?: string
  children: React.ReactNode
}) {
  const id = React.useId()
  const root = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<Drag | null>(null)
  /* Set when a gesture should eat the click that follows its pointerup. */
  const swallowClick = React.useRef(false)
  const [open, setOpen] = React.useState(false)
  const openRef = React.useRef(false)
  /** Live offset while a finger is dragging; null otherwise. */
  const [dragX, setDragX] = React.useState<number | null>(null)
  const dragXRef = React.useRef<number | null>(null)
  const moveTo = (x: number | null) => {
    dragXRef.current = x
    setDragX(x)
  }

  const onOpenChangeRef = React.useRef(onOpenChange)
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  })

  const change = React.useCallback(
    (next: boolean) => {
      if (openRef.current !== next) {
        openRef.current = next
        setOpen(next)
        onOpenChangeRef.current?.(next)
      }
      if (next) setOpenRow(id)
      else if (openRow === id) setOpenRow(null)
    },
    [id],
  )

  // Another row opening closes this one.
  React.useEffect(() => {
    const listener = (other: string | null) => {
      if (other !== id) change(false)
    }
    openListeners.add(listener)
    return () => {
      openListeners.delete(listener)
      if (openRow === id) openRow = null
    }
  }, [id, change])

  // While open: a tap elsewhere, any scroll, or Escape closes it.
  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) change(false)
    }
    const onScroll = () => change(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") change(false)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    // Capture: scroll does not bubble, and the list may be any scroller.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("scroll", onScroll, { capture: true })
      document.removeEventListener("keydown", onKey)
    }
  }, [open, change])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // A drag the browser did not follow with a click must not eat this tap.
    swallowClick.current = false
    // A mouse has hover to show the actions; dragging with it would fight
    // text selection for nothing.
    if (e.pointerType === "mouse" || !e.isPrimary) return
    drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, from: open ? -REVEAL : 0, intent: "undecided" }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (d.intent === "undecided") {
      d.intent = swipeIntent(dx, dy)
      if (d.intent === "vertical") {
        // The list is scrolling; this touch is no longer ours.
        drag.current = null
        return
      }
      if (d.intent === "undecided") return
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    moveTo(Math.max(-REVEAL, Math.min(0, d.from + dx)))
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    if (d.intent !== "horizontal") return
    // Snap: past half the reveal is open, anything short of it is closed.
    const at = dragXRef.current ?? d.from
    moveTo(null)
    swallowClick.current = true
    change(at < -REVEAL / 2)
  }

  const onClickCapture = (e: React.MouseEvent) => {
    if (swallowClick.current || open) {
      // The click after a drag is not a tap; a tap on an open row closes it.
      e.preventDefault()
      e.stopPropagation()
      if (!swallowClick.current) change(false)
      swallowClick.current = false
    }
  }

  const offset = dragX ?? (open ? -REVEAL : null)

  return (
    <div ref={root} className={cn("group/swipe relative overflow-hidden", className)}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        /* Inline only while dragging or open, so the hover / focus classes
           below are free to slide it otherwise. `translate`, not `transform`:
           Tailwind 4's translate utilities set `translate`, and the two
           properties ADD — an open row that is also hovered would slide
           twice as far. The same property means the inline value wins. */
        style={offset === null ? undefined : { translate: `${offset}px 0` }}
        className={cn(
          "relative z-10 touch-pan-y bg-card",
          // No easing while the finger is down: the row follows it exactly.
          dragX === null && "motion-safe:transition-transform motion-safe:duration-200",
          // Tailwind 4's hover variants apply only where the device can hover,
          // so a phone's sticky "hover" after a tap does not open the row.
          "group-hover/swipe:-translate-x-[144px] group-has-[:focus-visible]/swipe:-translate-x-[144px]",
        )}
      >
        {children}
      </div>
      {/* After the content, so Tab reaches the row before its actions; the
          content's z-10 keeps them underneath until it slides. */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: REVEAL }}>
        {actions.map(({ label, icon: Icon, onPress, tone = "default" }) => (
          <Button
            key={label}
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
            // Inset ring: the row clips its edges, so an offset ring would be cut off.
            className="h-full min-h-0 flex-1 flex-col gap-1 rounded-none px-0 text-caption focus-visible:ring-inset focus-visible:ring-offset-0"
            onClick={() => {
              change(false)
              onPress()
            }}
          >
            <Icon aria-hidden="true" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}
