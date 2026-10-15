import Link from "next/link"
import { ArrowRight, PawPrint } from "lucide-react"
import { SUPPORT_MAILTO } from "@/lib/site"

/**
 * Dark footer, per the reference.
 *
 * Built on `foreground`/`background` rather than a literal dark hex, so it
 * inverts with the theme instead of staying near-black on a dark page — the
 * mistake a hardcoded #1F1F1F would make.
 */
export function SiteFooter() {
  // `href: null` is a name with nowhere to go yet — it renders as text, not
  // as a link that does nothing.
  const cols: { title: string; links: { label: string; href: string | null }[] }[] = [
    {
      title: "Product",
      links: [
        { label: "Features", href: "/#product" },
        { label: "Pricing", href: "/#pricing" },
        { label: "For Residents", href: "/#pet-owners" },
        { label: "For Buildings", href: "/#buildings" },
        { label: "For Businesses", href: "/businessaccess" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About Park10x", href: null },
        { label: "Pass10x", href: null },
        { label: "Careers", href: null },
        { label: "Help", href: "/help" },
        { label: "Contact", href: SUPPORT_MAILTO },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Terms of Service", href: "/terms" },
        { label: "PIPEDA", href: "/privacy#pipeda" },
        { label: "Disclaimers", href: "/terms#disclaimers" },
      ],
    },
  ]
  return (
    <footer className="relative overflow-hidden bg-foreground px-5 pb-10 pt-16 text-background sm:px-8 sm:pt-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.1]"
        style={{ background: "radial-gradient(60% 70% at 82% 0%, rgba(253,147,64,0.9), transparent 60%)" }}
      />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
              </span>
              <span className="text-[17px] font-semibold tracking-tight">Pet10x</span>
            </Link>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-background/60">
              Pet governance, risk &amp; community for multi-unit residential buildings.
            </p>
            <Link
              href="/login?mode=signup"
              className="group mt-6 inline-flex items-center gap-2 rounded-lg bg-background px-5 py-2.5 text-[14px] font-semibold text-foreground transition-opacity hover:opacity-90"
            >
              Get started free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-background/50">{c.title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.href ? (
                      <a href={l.href} className="text-[14px] text-background/80 transition-colors hover:text-background">
                        {l.label}
                      </a>
                    ) : (
                      <span className="text-[14px] text-background/50">{l.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-white/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-background/55">© 2026 Park10x Services Inc. All rights reserved.</p>
          <p className="text-[12px] text-background/55">
            A governance &amp; management tool — not legal advice or a life-safety system.
          </p>
        </div>
      </div>
    </footer>
  )
}
