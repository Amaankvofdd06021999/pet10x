import type { ReactNode } from "react"
import { LandingNav } from "@/components/landing/landing-nav"
import { SiteFooter } from "@/components/landing/site-footer"

/**
 * The frame for /terms, /privacy and /help: the landing nav and footer around
 * one readable column. Server-rendered and public — none of these pages needs
 * a session, and middleware has no rule for them (lib/rbac.ts ROLE_ROUTES).
 */
export function LegalPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string
  intro?: ReactNode
  /** "Last updated" date; omitted on pages that are not a legal document. */
  updated?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <LandingNav />
      <main className="px-5 pb-20 pt-28 sm:px-8 sm:pt-32">
        <article className="mx-auto max-w-2xl">
          <header className="border-b border-border/60 pb-6">
            <h1 className="text-[30px] font-semibold tracking-tight sm:text-[38px]">{title}</h1>
            {updated && <p className="mt-2 text-[13px] text-muted-foreground">Last updated {updated}</p>}
            {intro && <div className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{intro}</div>}
          </header>
          <div className="flex flex-col gap-9 pt-8">{children}</div>
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-[19px] font-semibold tracking-tight sm:text-[21px]">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-foreground/85">{children}</div>
    </section>
  )
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-primary">{children}</ul>
}

export function LegalSubhead({ children }: { children: ReactNode }) {
  return <h3 className="pt-1 text-[15px] font-semibold text-foreground">{children}</h3>
}
