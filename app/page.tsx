import Link from "next/link"
import Image from "next/image"
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
  Sparkles,
  MessageCircle,
  MapPin,
  ShieldCheck,
  Utensils,
  Syringe,
  ListChecks,
  Siren,
} from "lucide-react"
import { LandingNav } from "@/components/landing/landing-nav"
import { Reveal } from "@/components/landing/reveal"

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

/**
 * Proof points, shown inline beneath the hero CTAs.
 *
 * They used to sit in their own full-width band under the fold, which put a
 * horizontal rule between the pitch and its evidence — the reader had to
 * scroll past the claim to reach the reason to believe it. Inline is the
 * arrangement the reference uses, and it is the right one: the numbers are
 * an argument for the headline, not a separate section.
 */
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
    body: "Progressive enforcement from verbal warning to fine, with procedural fairness built in. Every action is timestamped and audit-logged, so a dispute becomes a one-click CRT evidence package instead of a scramble through email.",
    points: ["Warning → fine escalation", "Procedural-fairness workflow", "CRT-ready export"],
  },
  {
    icon: Shield,
    eyebrow: "Compliance",
    title: "Every pet, documented and compliant.",
    body: "Rich pet profiles with vaccinations, municipal licenses, microchips, and building registration — plus automatic renewal reminders. Residents see exactly what's missing; managers see compliance at a glance.",
    points: ["Vaccination & license tracking", "Renewal reminders", "Per-building registration"],
  },
  {
    icon: Scale,
    eyebrow: "Accommodation & risk",
    title: "Accommodation and risk, handled with care.",
    body: "A structured workflow for ESA and service-animal requests with in-app legal guidance and encrypted documents — never adjudicating the disability, only verifying the paperwork. Building risk scoring turns into insurance-ready reports.",
    points: ["ESA / service-animal review", "Encrypted, access-logged docs", "Insurance-ready risk reports"],
  },
]

const OWNER_FEATURES = [
  {
    icon: Utensils,
    title: "Food, medicine & treats",
    body: "Log every meal, dose, and treat against daily targets — with a full history you can show your vet.",
  },
  {
    icon: Syringe,
    title: "Vaccinations & documents",
    body: "Store vaccination records, licenses, and microchip details — with reminders before anything expires.",
  },
  {
    icon: QrCode,
    title: "One-tap building registration",
    body: "Enter your building code to register your pet in seconds and stay in good standing automatically.",
  },
  {
    icon: ListChecks,
    title: "Care reminders & checklist",
    body: "A daily checklist and smart reminders so walks, feeds, and meds never slip through the cracks.",
  },
  {
    icon: Users,
    title: "Resident community",
    body: "Connect with neighbours through posts, lost & found, and building events — RSVP and reminders included.",
  },
  {
    icon: MapPin,
    title: "Nearby pet services",
    body: "Discover vets, groomers, walkers, and trainers near you, ranked by location and rating.",
  },
  {
    icon: Siren,
    title: "Emergency pet info",
    body: "Keep a time-limited summary that first responders can access for critical context when it matters most.",
  },
]

const CAPABILITIES = [
  { icon: QrCode, title: "Guest incident reports", body: "Anyone can scan a QR or enter a building code to report an issue with photo evidence — no account needed." },
  { icon: MessageCircle, title: "Building community", body: "A private, building-specific feed for residents to connect, ask, and share." },
  { icon: MapPin, title: "Lost & found", body: "Post and resolve lost pets with proximity alerts across the building." },
  { icon: Calendar, title: "Events", body: "Dog walks, vaccination clinics, and policy meetings with RSVP and reminders." },
  { icon: Store, title: "Services marketplace", body: "Vets, groomers, walkers, and trainers — discoverable by location and rating." },
  // Was "Emergency directory" — the dark band directly below now explains
  // that feature properly, and describing it twice in adjacent sections made
  // the grid look like filler. The shop is a real capability with no card yet.
  { icon: ShoppingBag, title: "Pet shop", body: "Curated food, gear and enrichment, chosen for the species your household actually has." },
]

const PERSONAS = [
  {
    icon: Users,
    title: "For Residents",
    body: "Register your pets, stay in good standing, connect with neighbours, and find trusted services.",
    points: ["Pet profiles & reminders", "Building rules, made clear", "Community & marketplace"],
    cta: "Get the app",
  },
  {
    icon: Building2,
    title: "For Building Managers",
    body: "Run pet operations from one dashboard — enforcement, approvals, accommodation, and risk.",
    points: ["Compliance dashboard", "Approvals & violations", "Risk & CRT export"],
    cta: "Book a demo",
    featured: true,
  },
  {
    icon: Store,
    title: "For Businesses",
    body: "List your services, reach pet owners in nearby buildings, and take bookings.",
    points: ["Business profiles", "Location-based reach", "Reviews & bookings"],
    cta: "List your business",
  },
]

const PRICING = [
  {
    name: "Pet Basic",
    price: "$0",
    cadence: "forever",
    tagline: "For casual pet owners getting started.",
    features: ["Up to 2 pets", "Building rules & contacts", "Lost & found (view)", "Community (read-only)", "Service directory"],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Pet Plus",
    price: "$4.99",
    cadence: "/ month",
    tagline: "Everything an active pet owner needs.",
    features: ["Unlimited pets & full profiles", "Vaccination & license reminders", "Post, comment & message", "Report incidents with evidence", "Ad-free experience"],
    cta: "Start free trial",
    featured: true,
  },
  {
    name: "Building Plan",
    price: "Custom",
    cadence: "per building",
    tagline: "Governance & risk for the whole building.",
    features: ["Admin dashboard & audit trails", "Enforcement & accommodation", "Risk scoring & insurance docs", "Resident communication", "CRT evidence export"],
    cta: "Book a demo",
    featured: false,
  },
]

/* Shared type scale (keeps hierarchy consistent across sections). */
const EYEBROW = "text-[13px] font-semibold uppercase tracking-[0.14em] text-primary"
const H2 = "text-[28px] font-semibold leading-[1.1] tracking-tight sm:text-[38px]"
const LEAD = "text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]"

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <LandingNav />

      {/* ===================== Hero ===================== */}
      <section className="relative overflow-hidden border-b border-border/60 px-5 pb-20 pt-28 sm:px-8 sm:pb-24 sm:pt-36">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div
            className="absolute left-1/2 top-[-18%] h-[460px] w-[min(880px,94vw)] -translate-x-1/2 rounded-full opacity-60"
            style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(253,147,64,0.12), rgba(47,191,184,0.05) 60%, rgba(253,147,64,0))" }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.035)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_72%_55%_at_50%_0%,#000_20%,transparent_72%)]" />
        </div>

        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-12">
          <div className="max-w-2xl">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-md card-raised px-3 py-1 text-[12px] font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                For pet owners &amp; the buildings they live in
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-6 text-balance text-[38px] font-semibold leading-[1.04] tracking-tight sm:text-[50px] lg:text-[56px]">
                Pet governance for modern buildings.
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 max-w-xl text-pretty text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">
                One app for pet owners to track care, store vaccinations, and connect with their
                community — and for buildings to handle bylaw enforcement, accommodation, and risk.
                So pets stay healthy, owners stay in good standing, and councils cut liability.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/app"
                  className="group inline-flex items-center justify-center gap-2 rounded-lg bg-primary-strong px-6 py-3 text-[15px] font-semibold text-primary-strong-foreground transition-colors hover:bg-primary-strong/90"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center gap-2 rounded-lg card-interactive px-6 py-3 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  Book a demo
                </Link>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div className="mt-7 flex items-center gap-2 text-[13px] text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-accent" />
                Governance &amp; risk platform — not legal advice or a life-safety system.
              </div>
            </Reveal>

            {/* Evidence sits with the claim, not a section below it. */}
            <Reveal delay={400}>
              <dl className="mt-9 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border/60 pt-7 sm:grid-cols-4 sm:gap-x-4">
                {STATS.map((s) => (
                  <div key={s.label} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <s.icon className="h-3.5 w-3.5 text-primary" />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-[19px] font-semibold leading-none tracking-tight text-foreground">
                        {s.value}
                      </dt>
                      <dd className="mt-1 text-[12px] leading-snug text-muted-foreground">{s.label}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          <Reveal delay={200} className="relative">
            <Image
              src="/hero-image.jpg"
              alt="Pet10x — pet governance app preview"
              width={1448}
              height={1086}
              priority
              className="h-auto w-full"
            />
          </Reveal>
        </div>
      </section>

      {/* ===================== For pet owners ===================== */}
      <section id="pet-owners" className="scroll-mt-16 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="max-w-2xl">
            <p className={EYEBROW}>For pet owners</p>
            <h2 className={`mt-3 ${H2}`}>Everything your pet needs, in one app.</h2>
            <p className={`mt-4 ${LEAD}`}>
              Track daily care, keep documents in order, and stay connected to the building you call
              home — without spreadsheets, sticky notes, or guesswork.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OWNER_FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 70}>
                <div className="group h-full rounded-2xl card-raised p-6 transition-colors hover:bg-muted/40">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              </Reveal>
            ))}
            <Reveal delay={70}>
              <div className="flex h-full flex-col justify-center rounded-2xl border border-primary/40 bg-primary/[0.03] p-6">
                <p className="text-[15px] font-semibold tracking-tight">Free to start.</p>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                  Set up your pet&apos;s profile in minutes — upgrade only when you&apos;re ready.
                </p>
                <Link
                  href="/app"
                  className="group mt-5 inline-flex items-center gap-2 text-[14px] font-semibold text-primary"
                >
                  Get the app
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== Features ===================== */}
      <section id="product" className="scroll-mt-16 border-t border-border/60 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="max-w-2xl">
            <p className={EYEBROW}>For buildings</p>
            <h2 className={`mt-3 ${H2}`}>The operational backbone for pets in your building.</h2>
            <p className={`mt-4 ${LEAD}`}>
              Every workflow a strata already handles — done digitally, consistently, and defensibly.
            </p>
          </Reveal>

          <div className="mt-16 flex flex-col gap-16 sm:gap-24">
            {FEATURES.map((f, i) => (
              <FeatureRow key={f.title} feature={f} flip={i % 2 === 1} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Capabilities =====================
          Centred header over a 3x2 card grid — the reference's
          "Comprehensive Care" block. Cards are separated rather than fused
          into a gapless bento: six equal things read as a list of six, and
          the hairline grid made them read as one table. */}
      <section className="border-y border-border/60 bg-secondary/40 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className={EYEBROW}>Beyond governance</p>
            <h2 className={`mt-3 ${H2}`}>Comprehensive care for every pet in the building.</h2>
            <p className={`mt-4 ${LEAD}`}>Where your building&apos;s pet life actually happens.</p>
          </Reveal>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.title} delay={(i % 3) * 70}>
                <div className="group h-full rounded-2xl card-raised p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_28px_-18px_rgba(0,0,0,0.28)]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary-strong group-hover:text-primary-strong-foreground">
                    <c.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-[16.5px] font-semibold tracking-tight">{c.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Emergency =====================
          The reference's dark full-bleed band, which is the single thing
          stopping a marketing page reading as one uninterrupted white
          scroll. Dark comes from `foreground`, not the reference's green,
          so it inverts correctly in dark mode instead of staying green.

          It carries the emergency directory because that is a real feature
          and the one with genuine urgency — a decorative dark band would be
          a stripe for its own sake. */}
      <section className="px-5 py-16 sm:px-8 sm:py-20">
        <Reveal className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl bg-foreground px-7 py-12 text-background sm:px-12 sm:py-14">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.14]"
              style={{
                background:
                  "radial-gradient(70% 90% at 88% 12%, rgba(253,147,64,0.9), transparent 62%), radial-gradient(60% 80% at 8% 96%, rgba(47,191,184,0.55), transparent 60%)",
              }}
            />
            <div className="relative grid items-center gap-9 lg:grid-cols-[1.25fr_1fr]">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-background/15 px-3 py-1 text-[12px] font-semibold">
                  <Siren className="h-3.5 w-3.5" />
                  Emergency access
                </span>
                <h2 className="mt-5 text-balance text-[27px] font-semibold leading-[1.12] tracking-tight sm:text-[34px]">
                  When seconds matter, responders know which units have pets.
                </h2>
                <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-background/75">
                  A time-limited QR gives fire and rescue a floor-by-floor pet summary — species, presence
                  and an emergency contact. Every view is logged, and the code can be revoked the moment
                  it is no longer needed.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/app"
                    className="group inline-flex items-center justify-center gap-2 rounded-lg bg-background px-6 py-3 text-[15px] font-semibold text-foreground transition-opacity hover:opacity-90"
                  >
                    See how it works
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <span className="text-[13px] text-background/60">No account needed to scan.</span>
                </div>
              </div>

              {/* Three facts rather than a stock photo: this band is about
                  what the feature guarantees, and a picture of a vet would
                  say nothing the copy does not. */}
              <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {[
                  { icon: QrCode, label: "Scan a QR", body: "No app, no login." },
                  { icon: ListChecks, label: "By floor & unit", body: "Species, presence, contact." },
                  { icon: ShieldCheck, label: "Logged & revocable", body: "Expires on its own." },
                ].map((f) => (
                  <li key={f.label} className="flex items-start gap-3 rounded-2xl bg-background/10 p-4">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-background/15">
                      <f.icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold">{f.label}</p>
                      <p className="mt-0.5 text-[12.5px] leading-snug text-background/65">{f.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ===================== Personas ===================== */}
      <section id="buildings" className="scroll-mt-16 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="max-w-2xl">
            <p className={EYEBROW}>One platform, every role</p>
            <h2 className={`mt-3 ${H2}`}>Built for everyone in the building.</h2>
          </Reveal>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {PERSONAS.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <div
                  className={`flex h-full flex-col rounded-xl border p-7 ${
                    p.featured ? "border-primary/40 bg-primary/[0.03]" : "border-border/70 bg-card"
                  }`}
                >
                  <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${p.featured ? "bg-primary-strong text-primary-strong-foreground" : "bg-muted text-foreground"}`}>
                    <p.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-[19px] font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{p.body}</p>
                  <ul className="mt-5 flex flex-col gap-2.5">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex items-center gap-2.5 text-[14px] text-foreground">
                        <Check className="h-4 w-4 flex-shrink-0 text-accent" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/app"
                    className={`mt-7 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-semibold transition-colors ${
                      p.featured
                        ? "bg-primary-strong text-primary-strong-foreground hover:bg-primary/90"
                        : "border border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {p.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Pricing ===================== */}
      <section id="pricing" className="scroll-mt-16 border-t border-border/60 bg-secondary/40 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className={EYEBROW}>Pricing</p>
            <h2 className={`mt-3 ${H2}`}>Simple, fair pricing.</h2>
            <p className={`mt-4 ${LEAD}`}>Free to start. Upgrade when you&apos;re ready — or let your building cover it.</p>
          </Reveal>

          {/* `items-center`, not `items-stretch`: the featured tier is taller,
              and stretching the other two to match would erase the lift that
              marks it. */}
          <div className="mt-14 grid items-center gap-4 lg:grid-cols-3">
            {PRICING.map((tier, i) => (
              <Reveal key={tier.name} delay={i * 70}>
                <div
                  className={`relative flex h-full flex-col rounded-2xl border bg-card ${
                    tier.featured
                      ? "border-primary/60 p-8 shadow-[0_18px_48px_-28px_rgba(253,147,64,0.55)] lg:scale-[1.035]"
                      : "border-border/70 p-7"
                  }`}
                >
                  {/* Badge sits on the border, as the reference does — inside
                      the card it competed with the plan name for the same row. */}
                  {tier.featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary-strong px-3 py-1 text-[11px] font-semibold text-primary-strong-foreground shadow-sm">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-[17px] font-semibold tracking-tight">{tier.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-[36px] font-semibold tracking-tight">{tier.price}</span>
                    <span className="text-[14px] text-muted-foreground">{tier.cadence}</span>
                  </div>
                  <p className="mt-2 text-[14px] text-muted-foreground">{tier.tagline}</p>
                  <ul className="mt-6 flex flex-1 flex-col gap-3">
                    {tier.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-[14px] text-foreground">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/app"
                    className={`mt-8 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-[14px] font-semibold transition-colors ${
                      tier.featured
                        ? "bg-primary-strong text-primary-strong-foreground hover:bg-primary/90"
                        : "border border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {tier.cta}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className="mt-6 flex max-w-3xl items-start gap-3 rounded-xl border border-accent/25 bg-accent/[0.05] p-5">
              <Building2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
              <p className="text-[14px] leading-relaxed text-foreground">
                <span className="font-semibold">Linked to a participating building?</span> Your premium is on the
                house — the building sponsors Pet Plus for every approved resident, at a bulk rate below the
                individual price.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="px-5 py-20 sm:px-8 sm:py-24">
        <Reveal>
          {/* Warm and light, not dark.
              It was `bg-foreground`, which was fine while the footer below it
              was white — with a dark footer the two merged into one black slab
              and the closing pitch stopped reading as its own moment. The
              reference puts light content immediately above its dark footer for
              exactly this reason. */}
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-primary/20 bg-primary/[0.06] px-7 py-14 text-center sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 80% at 50% 0%, rgba(253,147,64,0.16), transparent 70%), radial-gradient(45% 60% at 92% 100%, rgba(47,191,184,0.12), transparent 70%)",
              }}
            />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card px-3 py-1 text-[12px] font-semibold text-primary">
                <PawPrint className="h-3.5 w-3.5" />
                Free for residents
              </span>
              <h2 className="mx-auto mt-5 max-w-2xl text-balance text-[28px] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-[38px]">
                Bring order to pets in your building.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
                Start free as a resident, or book a demo to roll Pet10x out across your strata.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-strong px-7 py-3 text-[15px] font-semibold text-primary-strong-foreground transition-colors hover:bg-primary-strong/90"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center rounded-lg card-interactive px-7 py-3 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  Book a demo
                </Link>
              </div>
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

function FeatureRow({
  feature,
  flip,
  index,
}: {
  feature: (typeof FEATURES)[number]
  flip: boolean
  index: number
}) {
  const Icon = feature.icon
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal className={flip ? "lg:order-2" : ""}>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <p className={`mt-5 ${EYEBROW}`}>{feature.eyebrow}</p>
        <h3 className="mt-2 text-balance text-[24px] font-semibold leading-[1.15] tracking-tight sm:text-[30px]">{feature.title}</h3>
        <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">{feature.body}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {feature.points.map((p) => (
            <li key={p} className="flex items-center gap-2.5 text-[15px] font-medium text-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/15">
                <Check className="h-3 w-3 text-accent" />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={120} className={flip ? "lg:order-1" : ""}>
        <FeatureVisual index={index} />
      </Reveal>
    </div>
  )
}

function FeatureVisual({ index }: { index: number }) {
  if (index === 0) {
    const steps = ["Verbal warning", "Written warning", "Fine — $150"]
    return (
      <Panel>
        <PanelHeader title="Off-leash violation" subtitle="Unit 804 · Pepper" badge="Fine issued" badgeTone="destructive" />
        <div className="mt-5 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div className="flex-1 rounded-md bg-muted px-2.5 py-2 text-center text-[11px] font-medium text-foreground">{s}</div>
              {i < steps.length - 1 && <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border/70 bg-secondary/50 px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <FileText className="h-4 w-4 text-info" /> CRT evidence package
          </div>
          <span className="rounded-md bg-info/10 px-2.5 py-1 text-[11px] font-semibold text-info">Export</span>
        </div>
      </Panel>
    )
  }
  if (index === 1) {
    return (
      <Panel>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><PawPrint className="h-5 w-5" /></span>
          <div>
            <p className="text-[15px] font-semibold">Luna · Golden Retriever</p>
            <p className="text-[12px] text-muted-foreground">Maple Court Residences · Unit 302</p>
          </div>
          <span className="ml-auto rounded-md bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">92%</span>
        </div>
        <div className="mt-5 space-y-2.5">
          {[
            { label: "Rabies vaccination", status: "Expiring", tone: "warning" },
            { label: "Municipal license", status: "Valid", tone: "success" },
            { label: "Building registration", status: "Approved", tone: "success" },
          ].map((d) => (
            <div key={d.label} className="flex items-center justify-between rounded-lg card-raised px-4 py-3">
              <span className="text-[13px] font-medium text-foreground">{d.label}</span>
              <Tone tone={d.tone}>{d.status}</Tone>
            </div>
          ))}
        </div>
      </Panel>
    )
  }
  return (
    <Panel>
      <PanelHeader title="ESA accommodation" subtitle="Unit 1102 · Maine Coon" badge="Council review" badgeTone="info" />
      <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-info/[0.07] p-3.5">
        <Scale className="mt-0.5 h-4 w-4 flex-shrink-0 text-info" />
        <p className="text-[12px] leading-relaxed text-foreground">
          Verify documentation authenticity only — accommodation cannot be unreasonably denied.
        </p>
      </div>
      <div className="mt-4 rounded-lg border border-border/70 bg-secondary/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-muted-foreground">Building risk score</span>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-success"><TrendingUp className="h-3.5 w-3.5" /> Low</span>
        </div>
        <p className="mt-1 text-[26px] font-semibold tracking-tight">23<span className="text-[15px] font-medium text-muted-foreground">/100</span></p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[23%] rounded-full bg-success" />
        </div>
      </div>
    </Panel>
  )
}

function HeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-lg">
      <div className="rounded-2xl card-raised p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.18)]">
        <div className="mb-4 flex items-center justify-between px-1">
          <div>
            <p className="text-[11px] text-muted-foreground">Building</p>
            <p className="text-[14px] font-semibold tracking-tight">Maple Court Residences</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10"><Building2 className="h-4.5 w-4.5 text-info" /></span>
        </div>

        <div className="rounded-xl bg-primary-strong p-4 text-primary-strong-foreground">
          <p className="text-[11px] font-medium opacity-80">Building Compliance</p>
          <p className="text-[34px] font-semibold leading-none">94%</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary-foreground/25">
            <div className="h-full w-[94%] rounded-full bg-primary-foreground" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { v: "7", l: "Pets" },
            { v: "2", l: "Violations" },
            { v: "1", l: "Approvals" },
          ].map((s) => (
            <div key={s.l} className="rounded-lg card-raised p-2.5 text-center">
              <p className="text-[16px] font-semibold">{s.v}</p>
              <p className="text-[10px] text-muted-foreground">{s.l}</p>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-3 rounded-lg card-raised p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><PawPrint className="h-4.5 w-4.5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">Luna · Golden Retriever</p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-[92%] rounded-full bg-success" /></div>
            </div>
            <span className="rounded-md bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">Home</span>
          </div>
        </div>
      </div>

      <div className="absolute -left-5 bottom-8 hidden rotate-[-6deg] items-center gap-2 rounded-lg card-raised px-3.5 py-2.5 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.25)] sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-success/10"><Check className="h-4 w-4 text-success" /></span>
        <div>
          <p className="text-[11px] font-semibold leading-tight">Registration approved</p>
          <p className="text-[10px] text-muted-foreground">Unit 511 · Cat</p>
        </div>
      </div>
      <div className="absolute -right-4 top-10 hidden rotate-[6deg] items-center gap-2 rounded-lg card-raised px-3.5 py-2.5 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.25)] sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10"><Heart className="h-4 w-4 text-accent" /></span>
        <div>
          <p className="text-[11px] font-semibold leading-tight">Service animal</p>
          <p className="text-[10px] text-muted-foreground">Verified · Unit 708</p>
        </div>
      </div>
    </div>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl card-raised p-5 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.16)] sm:p-6">
      {children}
    </div>
  )
}

function PanelHeader({
  title,
  subtitle,
  badge,
  badgeTone,
}: {
  title: string
  subtitle: string
  badge: string
  badgeTone: "info" | "destructive" | "success" | "warning"
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[15px] font-semibold tracking-tight">{title}</p>
        <p className="text-[12px] text-muted-foreground">{subtitle}</p>
      </div>
      <Tone tone={badgeTone}>{badge}</Tone>
    </div>
  )
}

function Tone({ tone, children }: { tone: string; children: React.ReactNode }) {
  const map: Record<string, string> = {
    info: "bg-info/10 text-info",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-strong",
  }
  return <span className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${map[tone] ?? map.info}`}>{children}</span>
}

/**
 * Dark footer, per the reference.
 *
 * Built on `foreground`/`background` rather than a literal dark hex, so it
 * inverts with the theme instead of staying near-black on a dark page — the
 * mistake a hardcoded #1F1F1F would make.
 */
function SiteFooter() {
  const cols = [
    { title: "Product", links: ["Features", "Pricing", "For Residents", "For Buildings", "For Businesses"] },
    { title: "Company", links: ["About Park10x", "Pass10x", "Careers", "Contact"] },
    { title: "Legal", links: ["Privacy Policy", "Terms of Service", "PIPEDA", "Disclaimers"] },
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
              href="/app"
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
                  <li key={l}>
                    <a href="#" className="text-[14px] text-background/80 transition-colors hover:text-background">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-background/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-background/55">© 2026 Park10x Services Inc. All rights reserved.</p>
          <p className="text-[12px] text-background/55">
            A governance &amp; management tool — not legal advice or a life-safety system.
          </p>
        </div>
      </div>
    </footer>
  )
}
