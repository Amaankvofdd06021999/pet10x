"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { PawPrint, Menu, X, AlertTriangle, ArrowUpRight } from "lucide-react"

// Rooted at "/" so they still land on the right section from /terms, /privacy,
// /help and the journal, which reuse this nav.
const LINKS = [
  { href: "/#pet-owners", label: "The app" },
  { href: "/#buildings", label: "For buildings" },
  { href: "/#shop", label: "Shop local", soon: true },
  { href: "/#pricing", label: "Pricing" },
]

/* Marketing pages hold every weight at medium or below; the buttons' own
   semibold is overridden here rather than in the shared component. */
const PILL = "rounded-full font-medium"

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || open
          ? "border-b border-border bg-card/85 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2" aria-label="Pet10x home">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
            <PawPrint className="h-4.5 w-4.5 text-primary-foreground" strokeWidth={2.25} />
          </span>
          <span className="text-[21px] font-medium tracking-[-0.04em] text-foreground">pet10x</span>
        </Link>

        {/* Links show from lg: at md the three buttons and four links do not
            fit on one row, and the incident button is the one that must stay. */}
        <div className="hidden items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="flex items-center gap-1.5 text-meta font-medium text-foreground transition-colors hover:text-muted-foreground"
            >
              {l.label}
              {l.soon && (
                <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-foreground">
                  Soon
                </span>
              )}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {/* Reporting must be reachable without an account — the person who
              saw the incident is often not a resident and has nothing to sign
              in with. Outlined rather than solid so it reads as available
              without competing with "Get started". */}
          <Button asChild variant="secondary" size="sm" className={PILL}>
            <Link href="/report">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              Report incident
            </Link>
          </Button>
          <Button asChild variant="quiet" size="sm" className={PILL}>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className={`${PILL} group text-foreground`}>
            <Link href="/login?mode=signup">
              Get started
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>

        <Button
          variant="quiet"
          size="icon-lg"
          className="md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </nav>

      {/* Section links between md and lg, where the row only fits the buttons. */}
      <div className="hidden border-t border-border md:block lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-8 py-2.5">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-meta font-medium text-foreground hover:text-muted-foreground">
              {l.label}
            </a>
          ))}
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border bg-card/85 backdrop-blur-xl md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-4">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-body font-medium text-foreground transition-colors hover:bg-muted"
              >
                {l.label}
                {l.soon && (
                  <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]">
                    Soon
                  </span>
                )}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Button asChild variant="secondary" className={PILL}>
                <Link href="/report" onClick={() => setOpen(false)}>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Report incident
                </Link>
              </Button>
              <Button asChild variant="secondary" className={PILL}>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild className={`${PILL} text-foreground`}>
                <Link href="/login?mode=signup">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
