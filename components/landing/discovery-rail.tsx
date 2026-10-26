"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { SHOP_CONCEPTS } from "@/lib/landing-content"

/**
 * Horizontal rail of shop concepts. Native scroll with snap, so touch and
 * trackpads work as usual; the arrows just scroll by one card. The cards are
 * not links — there are no product pages until the marketplace exists.
 */
export function DiscoveryRail() {
  const track = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(0)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    const el = track.current
    if (!el) return
    const update = () => {
      const card = el.firstElementChild as HTMLElement | null
      const w = card ? card.offsetWidth + 16 : 1
      setPos(Math.min(SHOP_CONCEPTS.length - 1, Math.round(el.scrollLeft / w)))
      setAtStart(el.scrollLeft < 4)
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4)
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      el.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [])

  const go = (dir: 1 | -1) => {
    const el = track.current
    const card = el?.firstElementChild as HTMLElement | null
    if (!el || !card) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollBy({ left: dir * (card.offsetWidth + 16), behavior: reduce ? "auto" : "smooth" })
  }

  return (
    <div>
      <div
        ref={track}
        tabIndex={0}
        aria-label="Shop concepts preview"
        className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-2 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8 [&::-webkit-scrollbar]:hidden"
      >
        {SHOP_CONCEPTS.map((p, i) => (
          <article key={p.id} className="w-[78%] flex-shrink-0 snap-start rounded-3xl bg-card p-5 sm:w-[46%] lg:w-[31%]">
            <div className="flex items-center justify-between text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground">
              <span>
                0{i + 1} / {p.category}
              </span>
              <span>Concept</span>
            </div>
            <h3 className="mt-3 text-[24px] font-medium leading-tight tracking-[-0.03em]">{p.name}</h3>
            <div className="mt-4 aspect-square overflow-hidden rounded-2xl bg-cream">
              <Image
                src={p.image}
                alt={p.name}
                width={1254}
                height={1254}
                sizes="(max-width: 640px) 78vw, (max-width: 1024px) 46vw, 380px"
                className="h-full w-full object-contain p-4 transition-transform duration-700 hover:scale-[1.04] motion-reduce:transition-none"
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-meta text-muted-foreground">
              <span>{p.colour}</span>
              <span>Concept collection</span>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-meta text-muted-foreground">
          <span className="text-foreground">0{pos + 1}</span> / 0{SHOP_CONCEPTS.length} · Made for their little world.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={atStart}
            aria-label="Previous products"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={atEnd}
            aria-label="Next products"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
