import Link from "next/link"
import Image from "next/image"
import type { ReactNode } from "react"
import {
  PawPrint,
  Shield,
  Gavel,
  Scale,
  Building2,
  Users,
  Store,
  ShoppingBag,
  QrCode,
  Heart,
  Calendar,
  FileText,
  TrendingUp,
  Check,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  MapPin,
  ShieldCheck,
  Utensils,
  ListChecks,
  Siren,
  Stethoscope,
  Bell,
  Home,
  Plus,
} from "lucide-react"
import { LandingNav } from "@/components/landing/landing-nav"
import { Button } from "@/components/ui/button"
import { Reveal } from "@/components/landing/reveal"
import { SiteFooter } from "@/components/landing/site-footer"
import { EverydayChapters } from "@/components/landing/everyday-chapters"
import { DiscoveryRail } from "@/components/landing/discovery-rail"
import { ARTICLES, FAQS } from "@/lib/landing-content"

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const VALUES = [
  { icon: Heart, label: "Care that feels personal" },
  { icon: FileText, label: "Their details, together" },
  { icon: Users, label: "A closer building community" },
  { icon: ShoppingBag, label: "Local shopping, coming soon" },
]

/** What the chapters above don't already show, so the app's reach is visible. */
const ALSO_IN_APP = [
  { icon: Utensils, label: "Food, meds & treats" },
  { icon: QrCode, label: "One-tap building registration" },
  { icon: MapPin, label: "Lost & found alerts" },
  { icon: Calendar, label: "Building events & RSVPs" },
  { icon: Store, label: "Nearby vets, groomers & walkers" },
  { icon: Siren, label: "Emergency pet info" },
]

const STATS = [
  { icon: Building2, value: "450K+", label: "Strata units in BC" },
  { icon: PawPrint, value: "60%", label: "Of households own a pet" },
  { icon: TrendingUp, value: "$2–5K", label: "Yearly governance cost" },
  { icon: Sparkles, value: "1", label: "Platform to run it all" },
]

const FEATURES = [
  {
    icon: Gavel,
    eyebrow: "Governance",
    title: "Enforce bylaws fairly — with a paper trail.",
    body: "Progressive enforcement from verbal warning to fine, with procedural fairness built in. Every action is timestamped and audit-logged, ready as a CRT evidence package.",
    points: ["Warning → fine escalation", "Procedural-fairness workflow", "CRT-ready export"],
  },
  {
    icon: Shield,
    eyebrow: "Compliance",
    title: "Every pet, documented and compliant.",
    body: "Vaccinations, municipal licences, microchips and building registration with renewal reminders. Residents see what's missing; managers see compliance at a glance.",
    points: ["Vaccination & licence tracking", "Renewal reminders", "Per-building registration"],
  },
  {
    icon: Scale,
    eyebrow: "Accommodation & risk",
    title: "Accommodation and risk, handled with care.",
    body: "A structured ESA and service-animal workflow with encrypted documents — verifying paperwork, never adjudicating disability. Risk scoring turns into insurance-ready reports.",
    points: ["ESA / service-animal review", "Encrypted, access-logged docs", "Insurance-ready risk reports"],
  },
]

const PERSONAS = [
  {
    icon: Users,
    title: "For residents",
    body: "Register your pets, stay in good standing, connect with neighbours, and find trusted services.",
    points: ["Pet profiles & reminders", "Building rules, made clear", "Community & marketplace"],
    cta: "Get the app",
    href: "/login?mode=signup",
  },
  {
    icon: Building2,
    title: "For building managers",
    body: "Run pet operations from one dashboard — enforcement, approvals, accommodation, and risk.",
    points: ["Compliance dashboard", "Approvals & violations", "Risk & CRT export"],
    cta: "Book a demo",
    href: "/help#contact",
    featured: true,
  },
  {
    icon: Store,
    title: "For businesses",
    body: "List your services, reach pet owners in nearby buildings, and take bookings.",
    points: ["Business profiles", "Location-based reach", "Reviews & bookings"],
    cta: "List your business",
    href: "/businessaccess",
  },
  {
    icon: Stethoscope,
    title: "For vet clinics",
    body: "Run appointments, records and reminders, and share records with owners.",
    points: ["Appointments & reminders", "Medical records & sharing", "Billing & estimates"],
    cta: "Set up your clinic",
    href: "/clinic",
  },
]

const PRICING = [
  {
    name: "Pet Basic",
    price: "$0",
    cadence: "today",
    tagline: "Free for every pet owner today.",
    features: ["Building rules & contacts", "Lost & found (view)", "Community (read-only)", "Service directory"],
    cta: "Get started",
    href: "/login?mode=signup",
    featured: false,
  },
  {
    name: "Pet Plus",
    price: "$4.99",
    cadence: "/ month",
    tagline: "Everything an active pet owner needs.",
    features: ["Unlimited pets & full profiles", "Vaccination & licence reminders", "Post, comment & message", "Ad-free experience"],
    cta: "Get started free",
    href: "/login?mode=signup",
    featured: true,
  },
  {
    name: "Building Plan",
    price: "Custom",
    cadence: "per building",
    tagline: "Governance & risk for the whole building.",
    features: ["Admin dashboard & audit trails", "Enforcement & accommodation", "Risk scoring & insurance docs", "Resident communication", "CRT evidence export"],
    cta: "Book a demo",
    href: "/help#contact",
    featured: false,
  },
]

/* Shared type scale. Marketing pages stay at medium weight or lighter; the
   hero title is the only bold on the page. Second lines of headings drop to
   muted grey rather than orange — text is never orange (app/globals.css). */
const H2 = "text-balance text-[34px] font-medium leading-[1.02] tracking-[-0.045em] sm:text-[46px] lg:text-[56px]"
const LEAD = "text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]"
const PILL = "rounded-full font-medium"
/* Dark text on the orange fill: about 6:1, where white is about 2.2:1. */
const PILL_PRIMARY = `${PILL} group text-foreground`
const PILL_WHITE = `${PILL} group border-transparent bg-white text-foreground hover:bg-white hover:brightness-95`

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-card text-foreground">
      <LandingNav />

      {/* ===================== Hero =====================
          Three pets with their paws over three cards. The scene's top padding
          is the room the pets stand in; it scales with them. The section clips
          sideways only, so paws can still overlap the card tops. */}
      <section className="overflow-x-clip px-5 pt-28 sm:px-8 md:pt-40 lg:pt-32">
        <div className="mx-auto max-w-7xl">
          <Reveal immediate className="relative z-10 text-center">
            <span className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:text-caption">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft">
                <PawPrint className="h-3.5 w-3.5 text-primary" />
              </span>
              A little care. A whole lot of love.
            </span>
            <h1 className="mx-auto mt-5 text-[46px] font-bold leading-[0.96] tracking-[-0.055em] sm:text-[72px] lg:text-[100px]">
              Their whole world.
              <br />
              <span className="text-muted-foreground">A little closer.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-[17px]">
              Everyday care, friendly neighbours, and a building that knows them.
              <br className="hidden sm:block" /> A happier little world for pets — and their people.
            </p>
          </Reveal>

          <div className="relative mt-2 pt-[195px] sm:pt-[255px] md:pt-[305px] lg:pt-[365px]">
            {/* Floating notes. Hidden on phones, where the pets fill the width. */}
            <a
              href="#shop"
              className="absolute left-0 top-2 z-20 hidden w-[200px] -rotate-4 items-center gap-2 rounded-2xl bg-cream py-3 pl-1 pr-4 transition-transform hover:rotate-0 motion-reduce:transition-none md:flex lg:left-10 lg:w-[230px]"
            >
              <Image src="/landing/bowl.webp" alt="" width={1254} height={1254} sizes="90px" className="h-16 w-16 object-contain lg:h-20 lg:w-20" />
              <span className="text-[12px] leading-snug">
                Little finds.
                <br />
                <span className="text-[18px] font-medium tracking-[-0.04em]">Big happy.</span>
              </span>
              <span className="sr-only">— see the shop preview</span>
            </a>
            <a
              href="#community"
              className="absolute right-0 top-0 z-20 hidden w-[140px] rotate-5 rounded-2xl border border-border bg-card p-1.5 transition-transform hover:rotate-0 motion-reduce:transition-none md:block lg:right-14 lg:-top-6 lg:w-[160px]"
            >
              <Image
                src="/landing/community.webp"
                alt="Pet people on a neighbourhood walk"
                width={1536}
                height={1024}
                sizes="160px"
                className="h-[86px] w-full rounded-xl object-cover lg:h-[100px]"
              />
              <span className="flex items-center gap-1.5 px-1 pb-1 pt-2 text-[10px]">
                Your kind of people. <ArrowUpRight className="ml-auto h-3 w-3" />
              </span>
            </a>

            <div className="grid grid-cols-[1fr_1.22fr_1fr] gap-2 sm:gap-3.5">
              <HeroCard
                href="#pet-owners"
                tone="bg-primary-soft"
                pet={{
                  src: "/landing/peek-dachshund.webp",
                  alt: "A dachshund resting its paws over the care card",
                  className: "w-[150px] bottom-[calc(100%-31px)] sm:w-[210px] sm:bottom-[calc(100%-45px)] md:w-[260px] lg:w-[310px] lg:bottom-[calc(100%-65px)]",
                }}
                kicker="01 / Everyday care"
                title={<>Little routines.<br />Lots of love.</>}
                link="Meet your daily companion"
              />

              <div className="group relative flex min-w-0 flex-col items-center rounded-2xl bg-primary px-2 pb-5 pt-10 text-center sm:rounded-[22px] sm:px-4 sm:pb-7 sm:pt-14 lg:px-6 lg:pb-8 lg:pt-[70px]">
                <HeroPet
                  src="/landing/peek-golden.webp"
                  alt="A golden puppy peeking over the orange Pet10x card"
                  className="w-[245px] bottom-[calc(100%-30px)] sm:w-[310px] sm:bottom-[calc(100%-40px)] md:w-[360px] lg:w-[420px] lg:bottom-[calc(100%-51px)]"
                />
                <span className="text-[8px] font-medium uppercase tracking-[0.1em] sm:text-[10px]">Made for you two</span>
                <h2 className="mt-2.5 text-[17px] font-medium leading-[1.08] tracking-[-0.045em] sm:mt-3 sm:text-[24px] md:text-[28px] lg:text-[32px]">
                  Good days start here.
                </h2>
                <Button asChild size="lg" className={`${PILL_WHITE} mt-4 min-h-10 px-3 text-[12px] sm:mt-5 sm:min-h-12 sm:px-6 sm:text-body`}>
                  <Link href="/login?mode=signup">
                    Get started free
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                <span className="mt-3 text-[9px] sm:text-caption">
                  Free to start ·{" "}
                  <Link href="/login" className="underline underline-offset-2">
                    Sign in
                  </Link>
                </span>
              </div>

              <HeroCard
                href="#buildings"
                tone="bg-cream"
                pet={{
                  src: "/landing/peek-cat.webp",
                  alt: "A curious kitten peeking over the community card",
                  className: "w-[150px] bottom-[calc(100%-22px)] sm:w-[210px] sm:bottom-[calc(100%-28px)] md:w-[250px] lg:w-[290px] lg:bottom-[calc(100%-37px)]",
                }}
                kicker="02 / A little connection"
                title={<>More neighbours.<br />More friends.</>}
                link="Find your community"
              />
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-4 border-b border-border py-7 md:flex md:justify-between">
            {VALUES.map((v) => (
              <li key={v.label} className="flex items-center gap-2.5 text-meta text-muted-foreground">
                <v.icon className="h-4.5 w-4.5 flex-shrink-0 text-primary" />
                {v.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===================== For pet owners ===================== */}
      <section id="pet-owners" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHead
            eyebrow="One app. So much room for good."
            title="Less juggling."
            second="More belly rubs."
            lead="For the things you remember, and the things you'd rather not have to. Pet10x brings their whole world together — free to start."
          />
          <Reveal className="mt-12">
            <EverydayChapters />
          </Reveal>
          <Reveal className="mt-10">
            <p className="text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground">Also in the app</p>
            <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {ALSO_IN_APP.map((f) => (
                <li key={f.label} className="flex items-center gap-2.5 rounded-2xl border border-border px-3.5 py-3 text-[13.5px] leading-snug">
                  <f.icon className="h-4 w-4 flex-shrink-0 text-primary" />
                  {f.label}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ===================== Moments ===================== */}
      <section id="community" className="scroll-mt-24 px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="mx-auto max-w-7xl">
          <SectionHead
            eyebrow="A home for every kind of personality"
            title="Big personalities."
            second="Little everyday moments."
            lead="From the first walk to the last cuddle — more room for the good stuff."
          />
          <div className="mt-12 grid gap-4 md:grid-cols-[1.15fr_1fr] md:gap-5">
            <Reveal>
              <div className="group relative isolate h-[390px] overflow-hidden rounded-3xl bg-cream sm:h-[490px]">
                <Image
                  src="/landing/community.webp"
                  alt="A couple and their dog enjoying a neighbourhood walk"
                  fill
                  sizes="(max-width: 768px) 100vw, 680px"
                  className="object-cover object-[center_65%] transition-transform duration-700 group-hover:scale-[1.035] motion-reduce:transition-none"
                />
                <div aria-hidden className="absolute inset-x-0 top-0 h-3/5 bg-gradient-to-b from-card to-transparent" />
                <div className="absolute inset-x-6 top-6 sm:inset-x-8 sm:top-8">
                  <p className="text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground">Better together</p>
                  <h3 className="mt-3 text-[26px] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[36px]">
                    New friends.
                    <br />
                    Same favourite walk.
                  </h3>
                </div>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="group relative isolate h-[390px] overflow-hidden rounded-3xl bg-primary-soft sm:h-[490px]">
                <div className="absolute inset-x-6 top-6 max-w-[300px] sm:inset-x-8 sm:top-8">
                  <p className="text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground">Every detail, all theirs</p>
                  <h3 className="mt-3 text-[26px] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[36px]">
                    One little profile.
                    <br />
                    A whole personality.
                  </h3>
                </div>
                <Image
                  src="/landing/cat.webp"
                  alt="A silver cat sitting inside its own profile card"
                  width={1024}
                  height={1536}
                  sizes="310px"
                  className="absolute -bottom-14 right-0 h-[330px] w-auto object-contain transition-transform duration-700 group-hover:scale-[1.035] motion-reduce:transition-none sm:h-[430px]"
                />
                <span className="absolute bottom-6 left-6 flex items-center gap-2 rounded-full bg-card px-3.5 py-2 text-meta sm:left-8">
                  Milo · Chief curiosity officer <Heart className="h-3.5 w-3.5 text-primary" />
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== For buildings ===================== */}
      <section id="buildings" className="scroll-mt-24 border-t border-border px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <Reveal>
              <Eyebrow>For the places we call home</Eyebrow>
              <h2 className={`mt-5 ${H2}`}>
                Good neighbours.
                <br />
                <span className="text-muted-foreground">Great pet people.</span>
              </h2>
              <p className={`mt-5 max-w-lg ${LEAD}`}>
                A pet-friendly building takes a little teamwork. Pet10x gives managers and councils one
                place for registration, bylaw enforcement, accommodation and risk — consistent,
                documented and defensible.
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {[
                  { icon: PawPrint, label: "A home for every pet profile" },
                  { icon: Users, label: "A closer resident community" },
                  { icon: FileText, label: "A clear record of every decision" },
                ].map((p) => (
                  <li key={p.label} className="flex items-center gap-3 text-[15px]">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <p.icon className="h-4 w-4" />
                    </span>
                    {p.label}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className={PILL_PRIMARY}>
                  <Link href="/help#contact">
                    Book a demo
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </Button>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="relative rounded-3xl bg-primary-soft p-4 sm:p-8">
                <Dashboard />
                <span className="mt-4 flex items-center justify-center gap-2 text-meta text-muted-foreground">
                  Less chasing. More connection. <Heart className="h-3.5 w-3.5 text-primary" />
                </span>
              </div>
            </Reveal>
          </div>

          <Reveal>
            <dl className="mt-16 grid grid-cols-2 gap-x-6 gap-y-6 border-y border-border py-8 sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft">
                    <s.icon className="h-4 w-4 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-[26px] font-medium leading-none tracking-[-0.04em]">{s.value}</dt>
                    <dd className="mt-1.5 text-meta text-muted-foreground">{s.label}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Reveal>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <div className="flex h-full flex-col rounded-3xl bg-cream p-7">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-primary">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <p className="mt-6 text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground">{f.eyebrow}</p>
                  <h3 className="mt-2 text-[22px] font-medium leading-[1.15] tracking-[-0.03em]">{f.title}</h3>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">{f.body}</p>
                  <ul className="mt-5 flex flex-col gap-2.5">
                    {f.points.map((p) => (
                      <li key={p} className="flex items-center gap-2.5 text-[14px]">
                        <Check className="h-4 w-4 flex-shrink-0 text-success" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Emergency =====================
          The one dark band on the page, kept because it carries the feature
          with genuine urgency. `dark` scopes the dark-mode tokens to it. */}
      <section className="px-5 pb-20 sm:px-8 sm:pb-28">
        <Reveal className="mx-auto max-w-7xl">
          <div className="dark relative overflow-hidden rounded-3xl bg-card px-7 py-12 text-foreground sm:px-12 sm:py-14">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.14]"
              style={{
                background:
                  "radial-gradient(70% 90% at 88% 12%, color-mix(in oklab, var(--primary) 90%, transparent), transparent 62%)",
              }}
            />
            <div className="relative grid items-center gap-9 lg:grid-cols-[1.25fr_1fr]">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[12px] font-medium">
                  <Siren className="h-3.5 w-3.5" />
                  Emergency access
                </span>
                <h2 className="mt-5 text-balance text-[28px] font-medium leading-[1.08] tracking-[-0.04em] sm:text-[38px]">
                  When seconds matter, responders know which units have pets.
                </h2>
                <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-muted-foreground">
                  A time-limited QR gives fire and rescue a floor-by-floor pet summary — species, presence
                  and an emergency contact. Every view is logged, and the code can be revoked the moment
                  it is no longer needed.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  {/* Inside `.dark`, `text-background` is near-black. */}
                  <Button asChild variant="secondary" size="lg" className={`${PILL} group border-transparent bg-white text-background hover:bg-white hover:brightness-95`}>
                    <Link href="/help#emergency-access">
                      See how it works
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </Button>
                  <span className="text-[13px] text-muted-foreground">No account needed to scan.</span>
                </div>
              </div>
              <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {[
                  { icon: QrCode, label: "Scan a QR", body: "No app, no login." },
                  { icon: ListChecks, label: "By floor & unit", body: "Species, presence, contact." },
                  { icon: ShieldCheck, label: "Logged & revocable", body: "Expires on its own." },
                ].map((f) => (
                  <li key={f.label} className="flex items-start gap-3 rounded-2xl bg-white/10 p-4">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/15">
                      <f.icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium">{f.label}</p>
                      <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{f.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ===================== Shop (preview) ===================== */}
      <section id="shop" className="scroll-mt-24 bg-cream px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <Reveal className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <Eyebrow>The local edit · A new chapter, coming soon</Eyebrow>
              <h2 className={`mt-5 ${H2}`}>
                Little finds.
                <br />
                <span className="text-muted-foreground">Big happy.</span>
              </h2>
            </div>
            <p className={`max-w-sm ${LEAD}`}>
              Good things for your favourite little someone, from businesses near your building. A future
              marketplace, closer to home.
            </p>
          </Reveal>
          <Reveal className="mt-12">
            <DiscoveryRail />
          </Reveal>
          <p className="mt-6 text-caption text-muted-foreground">
            A preview of what&apos;s next. Products and availability are illustrative; no orders are being taken.
          </p>
        </div>
      </section>

      {/* ===================== Personas ===================== */}
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHead eyebrow="One platform, every role" title="Built for everyone" second="in the building." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PERSONAS.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <div className={`flex h-full flex-col rounded-3xl p-7 ${p.featured ? "bg-primary-soft" : "bg-cream"}`}>
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full ${p.featured ? "bg-primary text-foreground" : "bg-card text-primary"}`}>
                    <p.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-6 text-[21px] font-medium tracking-[-0.03em]">{p.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{p.body}</p>
                  <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex items-center gap-2.5 text-[14px]">
                        <Check className="h-4 w-4 flex-shrink-0 text-success" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant={p.featured ? "primary" : "secondary"} className={`mt-7 ${p.featured ? PILL_PRIMARY : PILL}`}>
                    <Link href={p.href}>
                      {p.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Pricing ===================== */}
      <section id="pricing" className="scroll-mt-24 border-t border-border px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHead
            center
            eyebrow="Pricing"
            title="Simple plans."
            second="Free to start."
            lead="Pet Basic is free for every pet owner today. Paid plans are coming soon."
          />
          {/* `items-center`: the featured tier is taller, and stretching the
              others to match would erase the lift that marks it. */}
          <div className="mt-14 grid items-center gap-4 lg:grid-cols-3">
            {PRICING.map((tier, i) => (
              <Reveal key={tier.name} delay={i * 70}>
                <div
                  className={`relative flex h-full flex-col rounded-3xl ${
                    tier.featured ? "border border-primary bg-primary-soft p-8 lg:scale-[1.035]" : "bg-cream p-7"
                  }`}
                >
                  {tier.featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-caption font-medium">
                      Coming soon
                    </span>
                  )}
                  <h3 className="text-[17px] font-medium">{tier.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-[40px] font-medium tracking-[-0.04em]">{tier.price}</span>
                    <span className="text-[14px] text-muted-foreground">{tier.cadence}</span>
                  </div>
                  <p className="mt-2 text-[14px] text-muted-foreground">{tier.tagline}</p>
                  <ul className="mt-6 flex flex-1 flex-col gap-3">
                    {tier.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-[14px]">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant={tier.featured ? "primary" : "secondary"} className={`mt-8 ${tier.featured ? PILL_PRIMARY : PILL}`}>
                    <Link href={tier.href}>{tier.cta}</Link>
                  </Button>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="mx-auto mt-8 flex max-w-3xl items-start gap-3 rounded-2xl bg-success-soft p-5">
              <Building2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
              <p className="text-[14px] leading-relaxed">
                <span className="font-medium">Planned — linked to a participating building?</span> Your premium is
                on the house: the building sponsors Pet Plus for every approved resident, at a bulk rate below
                the individual price.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== Journal ===================== */}
      <section className="border-t border-border px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <SectionHead eyebrow="A few notes from our little world" title="Good reads." second="For happy little lives." />
            <Link href="/journal" className="inline-flex items-center gap-2 text-[15px] font-medium underline-offset-4 hover:underline">
              Visit the journal <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {ARTICLES.map((a, i) => (
              <Reveal key={a.slug} delay={i * 80}>
                <Link href={`/journal/${a.slug}`} className="group block">
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
                  <h3 className="mt-2 text-[22px] font-medium leading-tight tracking-[-0.03em] group-hover:underline group-hover:underline-offset-4">
                    {a.title}
                  </h3>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== FAQ ===================== */}
      <section className="border-t border-border px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <Eyebrow>A little clarity</Eyebrow>
            <h2 className={`mt-5 ${H2}`}>
              Good questions.
              <br />
              <span className="text-muted-foreground">Simple answers.</span>
            </h2>
            <p className={`mt-5 ${LEAD}`}>Anything else on your mind?</p>
            <Link href="/help" className="mt-3 inline-flex items-center gap-2 text-[15px] font-medium underline-offset-4 hover:underline">
              Visit the help centre <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
          <Reveal delay={100}>
            <div className="border-t border-border">
              {FAQS.map(([q, a]) => (
                <details key={q} className="group border-b border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-medium tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
                    {q}
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft transition-transform group-open:rotate-45 motion-reduce:transition-none">
                      <Plus className="h-4 w-4" />
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== Closing invitation =====================
          The dachshund and kitten peek over the top edge of the orange panel;
          the top margin is the room they stand in. */}
      <section className="px-5 pb-20 pt-36 sm:px-8 sm:pb-24 sm:pt-48">
        <Reveal className="relative mx-auto max-w-7xl">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-[150px] z-10 h-[200px] sm:-top-[210px] sm:h-[280px]">
            <Image src="/landing/peek-dachshund.webp" alt="" width={1254} height={1254} sizes="280px" className="absolute bottom-0 left-[2%] h-full w-auto -rotate-[5deg] object-contain" />
            <Image src="/landing/peek-cat.webp" alt="" width={1254} height={1254} sizes="240px" className="absolute bottom-0 right-[3%] h-[85%] w-auto rotate-[6deg] object-contain" />
          </div>
          <div className="relative isolate overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center sm:px-10 sm:py-16">
            <PawPrint aria-hidden className="absolute -bottom-14 -right-10 -z-10 h-60 w-60 -rotate-[20deg] text-peach opacity-60" />
            <p className="flex items-center justify-center gap-2.5 text-caption font-medium uppercase tracking-[0.12em]">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
              One little app. So much to love.
            </p>
            <h2 className="mx-auto mt-5 max-w-3xl text-balance text-[40px] font-medium leading-[1.02] tracking-[-0.05em] sm:text-[58px] lg:text-[67px]">
              Their happy place. And yours.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-[16px] leading-relaxed">
              Start free as a resident, or book a demo to bring Pet10x to your whole building.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className={PILL_WHITE}>
                <Link href="/login?mode=signup">
                  Come on in
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild variant="quiet" size="lg" className={`${PILL} hover:bg-white/15`}>
                <Link href="/help#contact">Book a demo</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 text-caption font-medium uppercase tracking-[0.12em] text-foreground">
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
      {children}
    </p>
  )
}

function SectionHead({
  eyebrow,
  title,
  second,
  lead,
  center = false,
}: {
  eyebrow: string
  title: string
  second: string
  lead?: string
  center?: boolean
}) {
  return (
    <Reveal className={center ? "mx-auto max-w-2xl text-center [&>p:first-child]:justify-center" : "max-w-2xl"}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className={`mt-5 ${H2}`}>
        {title}
        <br />
        <span className="text-muted-foreground">{second}</span>
      </h2>
      {lead && <p className={`mt-5 ${LEAD}`}>{lead}</p>}
    </Reveal>
  )
}

function HeroPet({ src, alt, className }: { src: string; alt: string; className: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={1254}
      height={1254}
      loading="eager"
      fetchPriority="high"
      sizes="(max-width: 640px) 245px, (max-width: 1024px) 360px, 420px"
      className={`pointer-events-none absolute left-1/2 z-10 aspect-square h-auto max-w-none -translate-x-1/2 object-contain transition-transform duration-500 group-hover:-translate-y-2 motion-reduce:transition-none ${className}`}
    />
  )
}

function HeroCard({
  href,
  tone,
  pet,
  kicker,
  title,
  link,
}: {
  href: string
  tone: string
  pet: { src: string; alt: string; className: string }
  kicker: string
  title: ReactNode
  link: string
}) {
  return (
    <a
      href={href}
      className={`group relative flex min-w-0 flex-col items-center rounded-2xl px-2 pb-5 pt-10 text-center sm:rounded-[22px] sm:px-4 sm:pb-7 sm:pt-14 lg:px-6 lg:pb-8 lg:pt-[70px] ${tone}`}
    >
      <HeroPet {...pet} />
      <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-muted-foreground sm:text-[10px]">{kicker}</span>
      <h2 className="mt-2.5 text-[15px] font-medium leading-[1.08] tracking-[-0.045em] sm:mt-3 sm:text-[21px] md:text-[25px] lg:text-[29px]">
        {title}
      </h2>
      <span className="mt-auto flex items-center justify-center gap-2 pt-4 text-meta sm:gap-4 sm:pt-6">
        <span className="hidden sm:inline">{link}</span>
        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 sm:h-5 sm:w-5" />
      </span>
    </a>
  )
}

/** Illustrative building dashboard, with sample data, from the redesign. */
function Dashboard() {
  const rows = [
    { name: "Luna", breed: "Golden retriever", unit: "302", status: "Registered", img: "/landing/hero.webp" },
    { name: "Milo", breed: "British shorthair", unit: "207", status: "Registered", img: "/landing/cat.webp" },
    { name: "Pepper", breed: "Labrador mix", unit: "105", status: "In review", img: "/landing/hero.webp" },
  ]
  return (
    <div className="overflow-hidden rounded-2xl card-raised">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="flex items-center gap-2 text-[14px] font-medium">
          <PawPrint className="h-4 w-4 text-primary" /> pet10x
          <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">for buildings</span>
        </span>
        <Bell className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex">
        <div aria-hidden className="hidden flex-col items-center gap-5 border-r border-border px-3.5 py-5 text-muted-foreground sm:flex">
          <Home className="h-4 w-4 text-primary" />
          <Users className="h-4 w-4" />
          <FileText className="h-4 w-4" />
          <Shield className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 p-5">
          <p className="text-caption text-muted-foreground">Your community / Overview</p>
          <h3 className="mt-1 text-[20px] font-medium tracking-[-0.03em]">A happier place to call home.</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-cream p-3.5">
              <p className="text-caption text-muted-foreground">Pet profiles</p>
              <p className="mt-1 text-[26px] font-medium leading-none tracking-[-0.04em]">24</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">One connected community</p>
            </div>
            <div className="rounded-xl bg-cream p-3.5">
              <p className="text-caption text-muted-foreground">Registrations</p>
              <p className="mt-1 text-[26px] font-medium leading-none tracking-[-0.04em]">
                21 <span className="text-[15px] text-muted-foreground">/ 24</span>
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">3 awaiting review</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-meta">
              <span className="font-medium">Meet the neighbours</span>
              <span className="text-muted-foreground">View all →</span>
            </div>
            <ul className="mt-2 divide-y divide-border">
              {rows.map((r) => (
                <li key={r.name} className="flex items-center gap-3 py-2.5 text-meta">
                  <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-primary-soft">
                    <Image src={r.img} alt="" fill sizes="36px" className="object-cover object-top" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.name}</span>
                    <span className="block truncate text-caption text-muted-foreground">{r.breed}</span>
                  </span>
                  <span className="hidden text-muted-foreground sm:inline">Unit {r.unit}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-caption ${r.status === "In review" ? "bg-warning-soft" : "bg-success-soft"}`}
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className="border-t border-border px-5 py-2.5 text-center text-[11px] text-muted-foreground">
        Illustrative interface · sample community data
      </p>
    </div>
  )
}
