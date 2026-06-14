"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { PawPrint, Menu, X } from "lucide-react"

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#buildings", label: "For Buildings" },
  { href: "#pricing", label: "Pricing" },
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
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary shadow-sm shadow-primary/30">
            <PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-foreground">Pet10x</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/app"
            className="rounded-full px-4 py-2 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Sign in
          </Link>
          <Link
            href="/app"
            className="rounded-full bg-primary px-4 py-2 text-[14px] font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:scale-[1.03] hover:bg-primary/90 active:scale-[0.98]"
          >
            Get started
          </Link>
        </div>

        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
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
                className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Link
                href="/app"
                className="rounded-full border border-border px-4 py-2.5 text-center text-[15px] font-semibold text-foreground"
              >
                Sign in
              </Link>
              <Link
                href="/app"
                className="rounded-full bg-primary px-4 py-2.5 text-center text-[15px] font-semibold text-primary-foreground"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
