"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

interface RevealProps {
  children: ReactNode
  className?: string
  /** Stagger delay in ms (use for items in a grid/list). */
  delay?: number
  /** Initial translate distance in px (default 24). */
  y?: number
  /**
   * Render the final state with no transition. Above-the-fold content uses
   * this so it is in the server HTML and visible before scripts run, rather
   * than sitting at opacity-0 until hydration.
   */
  immediate?: boolean
}

/**
 * Scroll-triggered reveal. Fades + slides content up the first time it enters the
 * viewport. Respects `prefers-reduced-motion`. Dependency-free (IntersectionObserver).
 */
export function Reveal({ children, className = "", delay = 0, y = 24, immediate = false }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || immediate) return

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true)
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [immediate])

  if (immediate) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={`transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
        visible ? "opacity-100 translate-y-0" : "opacity-0"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms`, transform: visible ? undefined : `translateY(${y}px)` }}
    >
      {children}
    </div>
  )
}
