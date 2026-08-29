"use client"

import { useEffect, useRef, useState } from "react"

/**
 * The dog that follows your cursor.
 *
 * Forty-eight frames lifted out of SingleDog.mp4 and tiled into one WebP sheet,
 * so this costs a single request rather than forty-eight. Cursor position
 * across the viewport picks the frame; a spring-ish lerp runs the last stretch
 * so the head glides instead of snapping between frames.
 *
 * WHAT THE FOOTAGE ACTUALLY IS, so nobody "fixes" this later: the dog turns one
 * way and comes back. It is not a left-to-right sweep, so a literal gaze-follow
 * — look left when the cursor is left — is not in the material. What this does
 * is scrub the sequence with the cursor, which reads as alive and responsive
 * and is the honest version of the effect.
 *
 * Falls back on its own:
 *   coarse pointer (phones, tablets) -> plays itself, ping-ponging so the loop
 *                                       has no seam
 *   prefers-reduced-motion           -> one still frame, no rAF loop at all
 *   sheet still loading              -> nothing rendered, no layout shift
 */

const COLS = 8
const ROWS = 6
const FRAMES = 48
/** Frames per second when nobody is pointing at it. */
const AUTOPLAY_FPS = 20

export function DogScrubber({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef(0)
  const targetRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const dirRef = useRef(1)
  const lastTickRef = useRef(0)

  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<"pointer" | "auto" | "still">("still")

  // Decide how this behaves before doing any work, and keep listening: a
  // 2-in-1 laptop can gain a mouse halfway through a session.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)")
    const decide = () => setMode(reduced.matches ? "still" : fine.matches ? "pointer" : "auto")
    decide()
    reduced.addEventListener("change", decide)
    fine.addEventListener("change", decide)
    return () => {
      reduced.removeEventListener("change", decide)
      fine.removeEventListener("change", decide)
    }
  }, [])

  // Preload the sheet so the first paint is never a half-drawn dog.
  useEffect(() => {
    const img = new Image()
    img.src = "/dog/dog-sprite.webp"
    if (img.decode) {
      img.decode().then(() => setLoaded(true)).catch(() => setLoaded(true))
    } else {
      img.onload = () => setLoaded(true)
      img.onerror = () => setLoaded(true)
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !loaded) return

    const paint = (f: number) => {
      const i = Math.max(0, Math.min(FRAMES - 1, Math.round(f)))
      const col = i % COLS
      const row = Math.floor(i / COLS)
      host.style.backgroundPosition = `${(col * 100) / (COLS - 1)}% ${(row * 100) / (ROWS - 1)}%`
    }

    if (mode === "still") {
      paint(Math.floor(FRAMES / 2))
      return
    }

    // Only burn frames while the thing is actually on screen.
    let visible = false
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        if (visible && rafRef.current === null) {
          lastTickRef.current = performance.now()
          rafRef.current = requestAnimationFrame(tick)
        }
      },
      { rootMargin: "120px" },
    )
    io.observe(host)

    const onPointer = (e: PointerEvent) => {
      // Cursor across the viewport maps to the sequence. Full width rather than
      // the element's own box: the dog reacting to movement anywhere nearby is
      // the whole point, and a 220px hit area would barely register.
      targetRef.current = (e.clientX / window.innerWidth) * (FRAMES - 1)
    }

    function tick(now: number) {
      rafRef.current = null
      if (!visible) return

      if (mode === "auto") {
        const dt = now - lastTickRef.current
        if (dt >= 1000 / AUTOPLAY_FPS) {
          lastTickRef.current = now
          // Ping-pong: the clip does not loop cleanly, so reverse at the ends
          // instead of cutting back to frame 0.
          let next = frameRef.current + dirRef.current
          if (next >= FRAMES - 1) {
            next = FRAMES - 1
            dirRef.current = -1
          } else if (next <= 0) {
            next = 0
            dirRef.current = 1
          }
          frameRef.current = next
          paint(next)
        }
      } else {
        // Ease toward the cursor's frame. 0.18 is fast enough to feel attached
        // to the pointer and slow enough to hide the 48-frame step.
        const delta = targetRef.current - frameRef.current
        if (Math.abs(delta) > 0.01) {
          frameRef.current += delta * 0.18
          paint(frameRef.current)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    if (mode === "pointer") window.addEventListener("pointermove", onPointer, { passive: true })
    paint(frameRef.current)

    return () => {
      io.disconnect()
      window.removeEventListener("pointermove", onPointer)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [loaded, mode])

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`mx-auto aspect-square w-[188px] rounded-full bg-[#eef0e9] bg-no-repeat shadow-[0_18px_40px_-18px_rgba(44,46,48,0.35)] ring-1 ring-primary/15 transition-opacity duration-500 sm:w-[228px] ${
        loaded ? "opacity-100" : "opacity-0"
      } ${className}`}
      style={{
        backgroundImage: "url(/dog/dog-sprite.webp)",
        // One sheet, 8 across and 6 down, so each cell is the element's size.
        backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
      }}
    />
  )
}
