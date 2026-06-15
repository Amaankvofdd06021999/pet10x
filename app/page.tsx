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
  QrCode,
  Heart,
  Calendar,
  Bell,
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

const STATS = [
  { value: "450K+", label: "Strata units in BC" },
  { value: "60%", label: "Of households own a pet" },
  { value: "$2–5K", label: "Avg. yearly governance cost / building" },
  { value: "1", label: "Platform to run it all" },
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
  { icon: Bell, title: "Emergency directory", body: "A time-limited, access-logged pet summary for emergency context, by floor and unit." },
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
              <span className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-1 text-[12px] font-medium text-muted-foreground">
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
                  className="group inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted"
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

      {/* ===================== Stats ===================== */}
      <section className="border-b border-border/60 bg-secondary/40">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-border/60 sm:divide-y-0 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 70} className="px-5 py-8 sm:px-6 sm:py-10">
              <p className="text-[28px] font-semibold tracking-tight text-foreground sm:text-[32px]">{s.value}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{s.label}</p>
            </Reveal>
          ))}
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
                <div className="group h-full rounded-2xl border border-border bg-card p-6 transition-colors hover:bg-muted/40">
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

      {/* ===================== Bento ===================== */}
      <section className="border-y border-border/60 bg-secondary/40 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="max-w-2xl">
            <p className={EYEBROW}>Beyond governance</p>
            <h2 className={`mt-3 ${H2}`}>Everything in one place.</h2>
            <p className={`mt-4 ${LEAD}`}>Where your building&apos;s pet life actually happens.</p>
          </Reveal>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/60 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.title} delay={(i % 3) * 70}>
                <div className="group h-full bg-card p-6 transition-colors hover:bg-muted/40">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <c.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-[16px] font-semibold tracking-tight">{c.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
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
                  <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${p.featured ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
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
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
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
          <Reveal className="max-w-2xl">
            <p className={EYEBROW}>Pricing</p>
            <h2 className={`mt-3 ${H2}`}>Simple, fair pricing.</h2>
            <p className={`mt-4 ${LEAD}`}>Free to start. Upgrade when you&apos;re ready — or let your building cover it.</p>
          </Reveal>

          <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-3">
            {PRICING.map((tier, i) => (
              <Reveal key={tier.name} delay={i * 70}>
                <div
                  className={`flex h-full flex-col rounded-xl border bg-card p-7 ${
                    tier.featured ? "border-primary" : "border-border/70"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-[17px] font-semibold tracking-tight">{tier.name}</h3>
                    {tier.featured && (
                      <span className="rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">Most popular</span>
                    )}
                  </div>
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
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
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
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl bg-foreground px-7 py-14 text-center sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{ background: "radial-gradient(60% 80% at 50% 0%, rgba(253,147,64,0.2), transparent 70%)" }}
            />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-balance text-[28px] font-semibold leading-[1.1] tracking-tight text-background sm:text-[38px]">
                Bring order to pets in your building.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-background/70">
                Start free as a resident, or book a demo to roll Pet10x out across your strata.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-7 py-3 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center rounded-lg border border-background/25 px-7 py-3 text-[15px] font-semibold text-background transition-colors hover:bg-background/10"
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
        <PanelHeader title="Off-leash violation" subtitle="Unit 2104 · Rocky" badge="Fine issued" badgeTone="destructive" />
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
            <p className="text-[15px] font-semibold">Max · Golden Retriever</p>
            <p className="text-[12px] text-muted-foreground">Harbour View Tower · Unit 2104</p>
          </div>
          <span className="ml-auto rounded-md bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">92%</span>
        </div>
        <div className="mt-5 space-y-2.5">
          {[
            { label: "Rabies vaccination", status: "Expiring", tone: "warning" },
            { label: "Municipal license", status: "Valid", tone: "success" },
            { label: "Building registration", status: "Approved", tone: "success" },
          ].map((d) => (
            <div key={d.label} className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-4 py-3">
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
      <PanelHeader title="ESA accommodation" subtitle="Unit 1402 · Miniature Pig" badge="Council review" badgeTone="info" />
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
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.18)]">
        <div className="mb-4 flex items-center justify-between px-1">
          <div>
            <p className="text-[11px] text-muted-foreground">Building</p>
            <p className="text-[14px] font-semibold tracking-tight">Harbour View Tower</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10"><Building2 className="h-4.5 w-4.5 text-info" /></span>
        </div>

        <div className="rounded-xl bg-primary p-4 text-primary-foreground">
          <p className="text-[11px] font-medium opacity-80">Building Compliance</p>
          <p className="text-[34px] font-semibold leading-none">94%</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary-foreground/25">
            <div className="h-full w-[94%] rounded-full bg-primary-foreground" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { v: "47", l: "Pets" },
            { v: "5", l: "Violations" },
            { v: "3", l: "Approvals" },
          ].map((s) => (
            <div key={s.l} className="rounded-lg border border-border/70 bg-card p-2.5 text-center">
              <p className="text-[16px] font-semibold">{s.v}</p>
              <p className="text-[10px] text-muted-foreground">{s.l}</p>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><PawPrint className="h-4.5 w-4.5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">Max · Golden Retriever</p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-[92%] rounded-full bg-success" /></div>
            </div>
            <span className="rounded-md bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">Home</span>
          </div>
        </div>
      </div>

      <div className="absolute -left-5 bottom-8 hidden rotate-[-6deg] items-center gap-2 rounded-lg border border-border/70 bg-card px-3.5 py-2.5 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.25)] sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-success/10"><Check className="h-4 w-4 text-success" /></span>
        <div>
          <p className="text-[11px] font-semibold leading-tight">Registration approved</p>
          <p className="text-[10px] text-muted-foreground">Unit 310 · Cat</p>
        </div>
      </div>
      <div className="absolute -right-4 top-10 hidden rotate-[6deg] items-center gap-2 rounded-lg border border-border/70 bg-card px-3.5 py-2.5 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.25)] sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10"><Heart className="h-4 w-4 text-accent" /></span>
        <div>
          <p className="text-[11px] font-semibold leading-tight">Service animal</p>
          <p className="text-[10px] text-muted-foreground">Verified · Unit 820</p>
        </div>
      </div>
    </div>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.16)] sm:p-6">
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
    warning: "bg-warning/15 text-[#B8860B]",
  }
  return <span className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${map[tone] ?? map.info}`}>{children}</span>
}

function SiteFooter() {
  const cols = [
    { title: "Product", links: ["Features", "Pricing", "For Residents", "For Buildings", "For Businesses"] },
    { title: "Company", links: ["About Park10x", "Pass10x", "Careers", "Contact"] },
    { title: "Legal", links: ["Privacy Policy", "Terms of Service", "PIPEDA", "Disclaimers"] },
  ]
  return (
    <footer className="border-t border-border/60 px-5 py-14 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary"><PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} /></span>
              <span className="text-[17px] font-semibold tracking-tight">Pet10x</span>
            </Link>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              Pet governance, risk &amp; community for multi-unit residential buildings.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{c.title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-[14px] text-foreground/80 transition-colors hover:text-foreground">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-muted-foreground">© 2026 Park10x Services Inc. All rights reserved.</p>
          <p className="text-[12px] text-muted-foreground">A governance &amp; management tool — not legal advice or a life-safety system.</p>
        </div>
      </div>
    </footer>
  )
}
