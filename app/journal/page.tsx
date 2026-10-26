import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { LandingNav } from "@/components/landing/landing-nav"
import { SiteFooter } from "@/components/landing/site-footer"
import { ARTICLES } from "@/lib/landing-content"

export const metadata: Metadata = {
  title: "The journal — Pet10x",
  description: "Good reads for happy little lives: everyday care, neighbourhood life and what's next for Pet10x.",
}

export default function JournalPage() {
  return (
    <div className="min-h-dvh bg-card text-foreground">
      <LandingNav />
      <main className="px-5 pb-24 pt-32 sm:px-8 md:pt-44 lg:pt-36">
        <div className="mx-auto max-w-7xl">
          <p className="flex items-center gap-2.5 text-caption font-medium uppercase tracking-[0.12em]">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            The journal
          </p>
          <h1 className="mt-5 text-[44px] font-bold leading-[0.98] tracking-[-0.05em] sm:text-[64px]">
            Good reads.
            <br />
            <span className="text-muted-foreground">For happy little lives.</span>
          </h1>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {ARTICLES.map((a) => (
              <Link key={a.slug} href={`/journal/${a.slug}`} className="group block">
                <div className={`relative aspect-[4/3] overflow-hidden rounded-3xl ${a.contain ? "bg-primary-soft" : "bg-cream"}`}>
                  <Image
                    src={a.image}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 420px"
                    className={`transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transition-none ${
                      a.contain ? "object-contain object-bottom pt-6" : "object-cover"
                    }`}
                  />
                  <span className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-card">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between text-caption uppercase tracking-[0.1em] text-muted-foreground">
                  <span>{a.category}</span>
                  <span>{a.read}</span>
                </div>
                <h2 className="mt-2 text-[22px] font-medium leading-tight tracking-[-0.03em] group-hover:underline group-hover:underline-offset-4">
                  {a.title}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{a.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
