"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { PawPrint, Menu, X, AlertTriangle } from "lucide-react"

// Rooted at "/" so they still land on the right section from /terms, /privacy
// and /help, which reuse this nav.
const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#buildings", label: "For Buildings" },
  { href: "/#pricing", label: "Pricing" },
]

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
          ? "border-b border-border/60 bg-background/80 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2" aria-label="Pet10x home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
            <PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="text-title font-semibold tracking-tight text-foreground">Pet10x</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-meta font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {/* Reporting must be reachable without an account — the person who
              saw the incident is often not a resident and has nothing to sign
              in with. Outlined rather than solid so it reads as available
              without competing with "Get started". */}
          <Button asChild variant="secondary" size="sm">
            <Link href="/report">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              Report incident
            </Link>
          </Button>
          <Button asChild variant="quiet" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/login?mode=signup">Get started</Link>
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

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border/60 bg-background/95 backdrop-blur-xl md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-4">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-body font-medium text-foreground transition-colors hover:bg-muted"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Button asChild variant="secondary">
                <Link href="/report" onClick={() => setOpen(false)}>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Report incident
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/login?mode=signup">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
