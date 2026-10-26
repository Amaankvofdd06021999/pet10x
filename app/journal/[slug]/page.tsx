import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { LandingNav } from "@/components/landing/landing-nav"
import { SiteFooter } from "@/components/landing/site-footer"
import { ARTICLES } from "@/lib/landing-content"

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = ARTICLES.find((a) => a.slug === slug)
  return article ? { title: `${article.title} — Pet10x journal`, description: article.summary } : {}
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const article = ARTICLES.find((a) => a.slug === slug)
  if (!article) notFound()

  return (
    <div className="min-h-dvh bg-card text-foreground">
      <LandingNav />
      <main className="px-5 pb-24 pt-32 sm:px-8 md:pt-44 lg:pt-36">
        <article className="mx-auto max-w-2xl">
          <Link href="/journal" className="inline-flex items-center gap-2 text-meta text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> The journal
          </Link>
          <div className="mt-8 flex items-center gap-3 text-caption uppercase tracking-[0.1em] text-muted-foreground">
            <span>{article.category}</span>
            <span aria-hidden>·</span>
            <span>{article.read}</span>
          </div>
          <h1 className="mt-4 text-balance text-[40px] font-bold leading-[1] tracking-[-0.05em] sm:text-[56px]">{article.title}</h1>
          <p className="mt-5 text-[18px] leading-relaxed text-muted-foreground">{article.summary}</p>
          <div className={`relative mt-10 aspect-[16/10] overflow-hidden rounded-3xl ${article.contain ? "bg-primary-soft" : "bg-cream"}`}>
            <Image
              src={article.image}
              alt=""
              fill
              priority
              sizes="(max-width: 768px) 100vw, 672px"
              className={article.contain ? "object-contain object-bottom pt-8" : "object-cover"}
            />
          </div>
          <div className="mt-12 flex flex-col gap-10">
            {article.sections.map(([heading, body]) => (
              <section key={heading}>
                <h2 className="text-[24px] font-medium leading-tight tracking-[-0.03em]">{heading}</h2>
                <p className="mt-3 text-[16.5px] leading-[1.75] text-foreground">{body}</p>
              </section>
            ))}
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
