import Link from "next/link"
import { ArrowUpRight, PawPrint } from "lucide-react"
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site"

/**
 * Warm footer from the redesign: cream ground, three link columns and an
 * oversized wordmark bleeding off the bottom edge.
 *
 * The closing CTA above it is a solid orange panel, so the footer stays light;
 * a dark footer under an orange panel read as two competing endings.
 */
export function SiteFooter() {
  // `href: null` is a name with nowhere to go yet — it renders as text, not
  // as a link that does nothing.
  const cols: { title: string; links: { label: string; href: string | null; soon?: boolean }[] }[] = [
    {
      title: "One little world",
      links: [
        { label: "The Pet10x app", href: "/#pet-owners" },
        { label: "For buildings", href: "/#buildings" },
        { label: "Shop local", href: "/#shop", soon: true },
        { label: "Plans & pricing", href: "/#pricing" },
      ],
    },
    {
      title: "Get to know us",
      links: [
        { label: "For businesses", href: "/businessaccess" },
        { label: "For vet clinics", href: "/clinic" },
        { label: "The journal", href: "/journal" },
        { label: "Get in touch", href: SUPPORT_MAILTO },
      ],
    },
    {
      title: "Here to help",
      links: [
        { label: "Help centre", href: "/help" },
        { label: "Report an incident", href: "/report" },
        { label: "Privacy policy", href: "/privacy" },
        { label: "Terms of service", href: "/terms" },
      ],
    },
  ]
  return (
    <footer className="relative overflow-hidden border-t border-border bg-cream px-5 pt-16 text-foreground sm:px-8 sm:pt-20">
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-10 sm:grid-cols-3 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="sm:col-span-3 md:col-span-1">
            <Link href="/" className="flex items-center gap-2" aria-label="Pet10x home">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                <PawPrint className="h-4.5 w-4.5 text-primary-foreground" strokeWidth={2.25} />
              </span>
              <span className="text-[21px] font-medium tracking-[-0.04em]">pet10x</span>
            </Link>
            <p className="mt-6 text-[24px] font-medium leading-[1.2] tracking-[-0.02em]">
              A little care.
              <br />
              A more connected world.
            </p>
            <a
              href={SUPPORT_MAILTO}
              className="mt-5 inline-flex items-center gap-2 text-meta text-muted-foreground underline-offset-4 hover:underline"
            >
              {SUPPORT_EMAIL}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground">{c.title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.href ? (
                      <a href={l.href} className="inline-flex items-center gap-2 text-[14px] text-foreground underline-offset-4 hover:underline">
                        {l.label}
                        {l.soon && (
                          <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em]">
                            Soon
                          </span>
                        )}
                      </a>
                    ) : (
                      <span className="text-[14px] text-muted-foreground">{l.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-2 border-t border-border pt-6 text-caption text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Park10x Services Inc. All rights reserved.</p>
          <p>A governance &amp; community tool — not legal advice or a life-safety system.</p>
        </div>
      </div>
      {/* Decorative: the name is already in the logo link above. */}
      <div
        aria-hidden
        className="pointer-events-none mx-auto -mb-[0.2em] mt-6 max-w-7xl select-none text-center text-[26vw] font-medium leading-[0.8] tracking-[-0.085em] text-peach xl:text-[330px]"
      >
        pet10x
      </div>
    </footer>
  )
}
