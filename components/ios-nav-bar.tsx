"use client"

import type { ReactNode } from "react"

interface IOSNavBarProps {
  title: ReactNode
  largeTitle?: boolean
  /**
   * Puts the title on the SAME row as the actions, aligned left, instead of
   * on its own row beneath them. This is the branded-header shape from the
   * design reference — "Pet10x" and the bell sharing one horizontal axis.
   * `largeTitle` is ignored when this is set, since the two describe
   * different layouts.
   */
  inlineTitle?: boolean
  leftAction?: ReactNode
  rightAction?: ReactNode
}

export function IOSNavBar({
  title,
  largeTitle = true,
  inlineTitle = false,
  leftAction,
  rightAction,
}: IOSNavBarProps) {
  return (
    /* The hairline is a warm tint of the brand rather than neutral grey —
       barely there on white, but enough to separate the bar from content
       scrolling beneath the blur. */
    <header className="sticky top-0 z-40 border-b border-primary/15 bg-card/80 backdrop-blur-xl pt-safe">
      {inlineTitle ? (
        /* Roomier than the stock 44px bar: the branded header carries a
           wordmark rather than a page title, so it wants breathing room above
           and below. `pt-3` also guarantees a gap on devices with no
           safe-area inset, where `pt-safe` resolves to zero.

           Only this variant is padded. The `largeTitle` bar below is left at
           its original metrics because five screens pin sub-headers to it
           with `sticky top-[88px]`, and changing its height would slide them
           underneath the nav. */
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 pb-3 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            {leftAction}
            <h1 className="flex items-center gap-2 truncate text-[22px] font-bold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
          </div>
          <div className="flex flex-shrink-0 items-center">{rightAction}</div>
        </div>
      ) : !largeTitle ? (
        /* Centred title with a leading and trailing slot. Same 64px metrics
           as the inline variant so every compact bar in the app has one
           height.

           The title is absolutely centred on the BAR, not flexed between the
           slots — otherwise a wide trailing action ("My bookings") makes the
           right slot bigger than the left and drags the title off-axis. It is
           pointer-events-none so it can span the full width without stealing
           taps from the buttons underneath, and inset by px-24 so long titles
           truncate before they reach them. */
        <div className="relative flex min-h-16 items-center justify-between gap-2 px-4 pb-3 pt-3">
          <div className="z-10 flex flex-shrink-0 items-center">{leftAction}</div>
          {/* 20px bold, not the stock 17px semibold: this is the page's
              heading, not a label on a toolbar. It sits one step below the
              22px wordmark on Home, so the brand still outranks it. */}
          <h1 className="pointer-events-none absolute inset-x-0 truncate px-24 text-center text-[20px] font-bold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          <div className="z-10 flex flex-shrink-0 items-center gap-1">{rightAction}</div>
        </div>
      ) : (
        <>
          <div className="flex h-11 items-center justify-between px-4">
            <div className="flex min-w-[60px] items-center">{leftAction}</div>
            <div className="flex-1" />
            <div className="flex min-w-[60px] items-center justify-end">{rightAction}</div>
          </div>
          <div className="px-4 pb-2">
            <h1 className="text-[34px] font-bold leading-tight tracking-tight text-foreground">{title}</h1>
          </div>
        </>
      )}
    </header>
  )
}
