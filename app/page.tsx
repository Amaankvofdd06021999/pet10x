import Link from "next/link"
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

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <LandingNav />

      {/* ===================== Hero ===================== */}
      <section className="relative overflow-hidden px-5 pb-20 pt-28 sm:px-8 sm:pb-28 sm:pt-36">
        {/* decorative background */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div
            className="absolute left-1/2 top-[-15%] h-[520px] w-[min(900px,95vw)] -translate-x-1/2 rounded-full opacity-70"
            style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(253,147,64,0.16), rgba(47,191,184,0.06) 60%, rgba(253,147,64,0))" }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.045)_1px,transparent_0)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_25%,transparent_75%)]" />
        </div>

        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          {/* copy */}
          <div className="max-w-2xl">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[12px] font-medium text-muted-foreground backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Built for Canadian strata & condo operations
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-6 text-balance text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[56px] lg:text-[64px]">
                Pet governance for modern buildings.
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 max-w-xl text-pretty text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">
                Pet10x replaces spreadsheets and email threads with digital bylaw enforcement,
                accommodation workflows, risk scoring, and a resident community — so councils cut
                liability and owners stay in good standing.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/app"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] hover:bg-primary/90 active:scale-[0.99]"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  Book a demo
                </Link>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div className="mt-8 flex items-center gap-2 text-[13px] text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-accent" />
                Governance & risk platform — not legal advice or a life-safety system.
              </div>
            </Reveal>
          </div>

          {/* product mock */}
          <Reveal delay={200} className="relative">
            <HeroMock />
          </Reveal>
        </div>
      </section>

      {/* ===================== Stats ===================== */}
      <section className="border-y border-border/60 bg-secondary/40">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden px-5 sm:px-8 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 70} className="px-2 py-8 text-center sm:py-10">
              <p className="text-[28px] font-bold tracking-tight text-foreground sm:text-[34px]">{s.value}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== Features ===================== */}
      <section id="product" className="scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-primary">The platform</p>
            <h2 className="mt-3 text-balance text-[32px] font-bold tracking-tight sm:text-[44px]">
              The operational backbone for pets in your building.
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
              Every workflow a strata already handles — done digitally, consistently, and defensibly.
            </p>
          </Reveal>

          <div className="mt-20 flex flex-col gap-20 sm:gap-28">
            {FEATURES.map((f, i) => (
              <FeatureRow key={f.title} feature={f} flip={i % 2 === 1} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Bento ===================== */}
      <section className="border-t border-border/60 bg-secondary/40 px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-[32px] font-bold tracking-tight sm:text-[44px]">Everything in one place.</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
              Beyond governance, Pet10x is where your building's pet life actually happens.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.title} delay={(i % 3) * 80}>
                <div className="group h-full rounded-2xl border border-border/70 bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-black/[0.04]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <c.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-[17px] font-semibold tracking-tight">{c.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Personas ===================== */}
      <section id="buildings" className="scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-primary">One platform, every role</p>
            <h2 className="mt-3 text-balance text-[32px] font-bold tracking-tight sm:text-[44px]">Built for everyone in the building.</h2>
          </Reveal>
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {PERSONAS.map((p, i) => (
              <Reveal key={p.title} delay={i * 90}>
                <div
                  className={`flex h-full flex-col rounded-3xl border p-7 transition-all ${
                    p.featured
                      ? "border-primary/30 bg-primary/[0.04] shadow-xl shadow-primary/5"
                      : "border-border/70 bg-card hover:border-border"
                  }`}
                >
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${p.featured ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    <p.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-[20px] font-semibold tracking-tight">{p.title}</h3>
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
                    className={`mt-7 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold transition-all ${
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
      <section id="pricing" className="scroll-mt-20 border-t border-border/60 bg-secondary/40 px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-[32px] font-bold tracking-tight sm:text-[44px]">Simple, fair pricing.</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
              Free to start. Upgrade when you're ready — or let your building cover it.
            </p>
          </Reveal>

          <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
            {PRICING.map((tier, i) => (
              <Reveal key={tier.name} delay={i * 80}>
                <div
                  className={`flex h-full flex-col rounded-3xl border p-7 ${
                    tier.featured
                      ? "border-primary bg-card shadow-2xl shadow-primary/10 ring-1 ring-primary/20"
                      : "border-border/70 bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-[18px] font-semibold tracking-tight">{tier.name}</h3>
                    {tier.featured && (
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">Most popular</span>
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-[40px] font-bold tracking-tight">{tier.price}</span>
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
                    className={`mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-[14px] font-semibold transition-all ${
                      tier.featured
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
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
            <div className="mx-auto mt-8 flex max-w-3xl items-start gap-3 rounded-2xl border border-accent/20 bg-accent/[0.06] p-5">
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
      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <Reveal>
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-foreground px-7 py-16 text-center sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{ background: "radial-gradient(60% 80% at 50% 0%, rgba(253,147,64,0.25), transparent 70%)" }}
            />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-balance text-[30px] font-bold tracking-tight text-background sm:text-[42px]">
                Bring order to pets in your building.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-background/70">
                Start free as a resident, or book a demo to roll Pet10x out across your strata.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] hover:bg-primary/90"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center rounded-full border border-background/25 px-7 py-3.5 text-[15px] font-semibold text-background transition-colors hover:bg-background/10"
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
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </span>
        <p className="mt-5 text-[13px] font-semibold uppercase tracking-wider text-primary">{feature.eyebrow}</p>
        <h3 className="mt-2 text-balance text-[26px] font-bold tracking-tight sm:text-[32px]">{feature.title}</h3>
        <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">{feature.body}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {feature.points.map((p) => (
            <li key={p} className="flex items-center gap-2.5 text-[15px] font-medium text-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15">
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

/** Stylized, code-drawn previews for each feature row (no image assets needed). */
function FeatureVisual({ index }: { index: number }) {
  if (index === 0) {
    // Enforcement pipeline
    const steps = [
      { label: "Verbal warning", tone: "info", done: true },
      { label: "Written warning", tone: "warning", done: true },
      { label: "Fine — $150", tone: "destructive", done: false },
    ]
    return (
      <Panel>
        <PanelHeader title="Off-leash violation" subtitle="Unit 2104 · Rocky" badge="Fine issued" badgeTone="destructive" />
        <div className="mt-5 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.label} className="flex flex-1 items-center gap-2">
              <div className="flex-1 rounded-lg bg-muted px-2.5 py-2 text-center text-[11px] font-medium text-foreground">{s.label}</div>
              {i < steps.length - 1 && <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border/70 bg-secondary/50 px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <FileText className="h-4 w-4 text-info" /> CRT evidence package
          </div>
          <span className="rounded-full bg-info/10 px-2.5 py-1 text-[11px] font-semibold text-info">Export</span>
        </div>
      </Panel>
    )
  }
  if (index === 1) {
    // Pet profile + compliance
    return (
      <Panel>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><PawPrint className="h-6 w-6" /></span>
          <div>
            <p className="text-[15px] font-semibold">Max · Golden Retriever</p>
            <p className="text-[12px] text-muted-foreground">Harbour View Tower · Unit 2104</p>
          </div>
          <span className="ml-auto rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">92%</span>
        </div>
        <div className="mt-5 space-y-2.5">
          {[
            { label: "Rabies vaccination", status: "Expiring", tone: "warning" },
            { label: "Municipal license", status: "Valid", tone: "success" },
            { label: "Building registration", status: "Approved", tone: "success" },
          ].map((d) => (
            <div key={d.label} className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-3">
              <span className="text-[13px] font-medium text-foreground">{d.label}</span>
              <Tone tone={d.tone}>{d.status}</Tone>
            </div>
          ))}
        </div>
      </Panel>
    )
  }
  // Accommodation + risk
  return (
    <Panel>
      <PanelHeader title="ESA accommodation" subtitle="Unit 1402 · Miniature Pig" badge="Council review" badgeTone="info" />
      <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-info/[0.07] p-3.5">
        <Scale className="mt-0.5 h-4 w-4 flex-shrink-0 text-info" />
        <p className="text-[12px] leading-relaxed text-foreground">
          Verify documentation authenticity only — accommodation cannot be unreasonably denied.
        </p>
      </div>
      <div className="mt-4 rounded-xl border border-border/70 bg-secondary/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-muted-foreground">Building risk score</span>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-success"><TrendingUp className="h-3.5 w-3.5" /> Low</span>
        </div>
        <p className="mt-1 text-[28px] font-bold tracking-tight">23<span className="text-[15px] font-medium text-muted-foreground">/100</span></p>
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
      <div className="rounded-[28px] border border-border/70 bg-card p-4 shadow-2xl shadow-black/[0.10]">
        <div className="mb-4 flex items-center justify-between px-1">
          <div>
            <p className="text-[11px] text-muted-foreground">Building</p>
            <p className="text-[14px] font-semibold tracking-tight">Harbour View Tower</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-info/10"><Building2 className="h-4.5 w-4.5 text-info" /></span>
        </div>

        <div className="rounded-2xl bg-primary p-4 text-primary-foreground">
          <p className="text-[11px] font-medium opacity-80">Building Compliance</p>
          <p className="text-[36px] font-bold leading-none">94%</p>
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
            <div key={s.l} className="rounded-xl border border-border/70 bg-card p-2.5 text-center">
              <p className="text-[16px] font-bold">{s.v}</p>
              <p className="text-[10px] text-muted-foreground">{s.l}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><PawPrint className="h-4.5 w-4.5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">Max · Golden Retriever</p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-[92%] rounded-full bg-success" /></div>
            </div>
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">Home</span>
          </div>
        </div>
      </div>

      {/* floating chips */}
      <div className="absolute -left-5 bottom-8 hidden rotate-[-7deg] items-center gap-2 rounded-2xl border border-border/70 bg-card px-3.5 py-2.5 shadow-xl shadow-black/[0.08] sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/10"><Check className="h-4 w-4 text-success" /></span>
        <div>
          <p className="text-[11px] font-semibold leading-tight">Registration approved</p>
          <p className="text-[10px] text-muted-foreground">Unit 310 · Cat</p>
        </div>
      </div>
      <div className="absolute -right-4 top-10 hidden rotate-[7deg] items-center gap-2 rounded-2xl border border-border/70 bg-card px-3.5 py-2.5 shadow-xl shadow-black/[0.08] sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10"><Heart className="h-4 w-4 text-accent" /></span>
        <div>
          <p className="text-[11px] font-semibold leading-tight">Service animal</p>
          <p className="text-[10px] text-muted-foreground">Verified · Unit 820</p>
        </div>
      </div>
    </div>
  )
}

/* small primitives for the visuals */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[24px] border border-border/70 bg-card p-5 shadow-xl shadow-black/[0.05] sm:p-6">
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
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${map[tone] ?? map.info}`}>{children}</span>
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
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary"><PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} /></span>
              <span className="text-[17px] font-semibold tracking-tight">Pet10x</span>
            </Link>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              Pet governance, risk & community for multi-unit residential buildings.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{c.title}</p>
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
          <p className="text-[12px] text-muted-foreground">A governance & management tool — not legal advice or a life-safety system.</p>
        </div>
      </div>
    </footer>
  )
}
