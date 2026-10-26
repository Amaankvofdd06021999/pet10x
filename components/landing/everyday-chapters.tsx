"use client"

import Image from "next/image"
import { useRef, useState, type KeyboardEvent } from "react"
import { ArrowRight, Bell, Check, FileText, Plus, Sun, Users } from "lucide-react"

const CHAPTERS = [
  { n: "01", title: "The everyday, made easy.", body: "Meals, walks, meds and the little reminders that make a day feel good." },
  { n: "02", title: "All their little details.", body: "Vaccinations, licences, renewals, and a profile as individual as they are." },
  { n: "03", title: "Your kind of pet people.", body: "Neighbours, lost & found, events — a community close to home." },
]

/**
 * The redesign's "feature chapters": a vertical tablist on the left, an
 * illustrative panel on the right. Arrow keys move between tabs (WAI-ARIA
 * tabs pattern, automatic activation).
 */
export function EverydayChapters() {
  const [active, setActive] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0
    const to = e.key === "Home" ? 0 : e.key === "End" ? CHAPTERS.length - 1 : (active + step + CHAPTERS.length) % CHAPTERS.length
    if (!step && e.key !== "Home" && e.key !== "End") return
    e.preventDefault()
    setActive(to)
    tabs.current[to]?.focus()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
      <div role="tablist" aria-label="Explore everyday pet life" aria-orientation="vertical" className="flex flex-col gap-3" onKeyDown={onKey}>
        {CHAPTERS.map((c, i) => {
          const selected = i === active
          return (
            <button
              key={c.n}
              ref={(el) => {
                tabs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`chapter-tab-${i}`}
              aria-controls={`chapter-panel-${i}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={`group flex items-start gap-4 rounded-2xl border p-5 text-left transition-colors sm:p-6 ${
                selected ? "border-peach bg-cream" : "border-border bg-card hover:bg-cream"
              }`}
            >
              <span className="mt-1 text-caption font-medium text-muted-foreground">{c.n}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[19px] font-medium leading-tight tracking-[-0.03em] sm:text-[22px]">{c.title}</span>
                <span className={`mt-2 block text-[14px] leading-relaxed text-muted-foreground ${selected ? "" : "lg:hidden"}`}>{c.body}</span>
              </span>
              <span
                className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                  selected ? "bg-primary text-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          )
        })}
      </div>

      <div className="relative min-h-[460px] overflow-hidden rounded-3xl bg-primary-soft sm:min-h-[500px]">
        <div role="tabpanel" id="chapter-panel-0" aria-labelledby="chapter-tab-0" hidden={active !== 0} className="h-full">
          <CarePanel />
        </div>
        <div role="tabpanel" id="chapter-panel-1" aria-labelledby="chapter-tab-1" hidden={active !== 1} className="h-full">
          <RecordsPanel />
        </div>
        <div role="tabpanel" id="chapter-panel-2" aria-labelledby="chapter-tab-2" hidden={active !== 2} className="h-full">
          <CommunityPanel />
        </div>
      </div>
    </div>
  )
}

function CarePanel() {
  const [done, setDone] = useState(false)
  const count = done ? 3 : 2
  // Ring length for r=50: 2πr ≈ 314.
  const offset = 314 - (314 * count) / 3

  return (
    <div className="flex h-full items-center justify-center p-6 sm:p-10">
      <span className="absolute left-6 top-6 text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground sm:left-8 sm:top-8">
        Big love. Small routines.
      </span>
      <div className="mt-8 w-full max-w-sm rounded-3xl card-raised p-6">
        <div className="flex items-center justify-between text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Your little everyday
          <Sun className="h-4 w-4 text-primary" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-[24px] font-medium leading-[1.1] tracking-[-0.03em]">
            You’re doing
            <br />
            great, pet parent.
          </p>
          <div className="relative h-20 w-20 flex-shrink-0">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r="50" fill="none" strokeWidth="10" className="stroke-muted" />
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray="314"
                strokeDashoffset={offset}
                className="stroke-primary transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
              />
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[18px] font-medium leading-none">
                {count}
                <span className="text-muted-foreground">/3</span>
              </span>
              <span className="mt-0.5 text-[9px] text-muted-foreground">done</span>
            </span>
          </div>
        </div>
        <ul className="mt-5 flex flex-col gap-2">
          {[
            ["Breakfast, served.", "8:00 am"],
            ["Morning adventures.", "9:00 am"],
          ].map(([label, time]) => (
            <li key={label} className="flex items-center gap-3 rounded-xl bg-cream px-3.5 py-3 text-[14px]">
              <Check className="h-4 w-4 text-success" />
              <span className="flex-1">{label}</span>
              <span className="text-caption text-muted-foreground">{time}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-pressed={done}
          onClick={() => setDone((v) => !v)}
          className={`mt-2 flex w-full items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 text-left text-[14px] transition-colors ${
            done ? "border-transparent bg-success-soft" : "border-peach bg-card hover:bg-cream"
          }`}
        >
          {done ? <Check className="h-4 w-4 text-success" /> : <Plus className="h-4 w-4 text-primary" />}
          <span className="flex-1">{done ? "Playtime, done. Lovely." : "Try a playtime check-in"}</span>
          <span className="text-caption text-muted-foreground">4:00 pm</span>
        </button>
        <p className="mt-3 text-center text-caption text-muted-foreground" aria-live="polite">
          {done ? "All three little things done today." : "Interactive example · give the last item a tap"}
        </p>
      </div>
    </div>
  )
}

function RecordsPanel() {
  return (
    <div className="relative h-full min-h-[460px] sm:min-h-[500px]">
      <span className="absolute left-6 top-6 z-10 text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground sm:left-8 sm:top-8">
        A home for their whole story.
      </span>
      <Image
        src="/landing/cat.webp"
        alt="Milo, a silver cat, beside example records"
        width={1024}
        height={1536}
        sizes="(max-width: 1024px) 60vw, 340px"
        className="absolute bottom-0 right-0 h-[88%] w-auto object-contain"
      />
      <div className="absolute left-5 top-20 z-10 flex max-w-[280px] items-center gap-3 rounded-2xl card-raised p-4 sm:left-8 sm:top-24">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <FileText className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium">Milo’s vaccination record</span>
          <span className="block text-caption text-muted-foreground">Right here when you need it.</span>
        </span>
        <Check className="h-4 w-4 text-success" />
      </div>
      <div className="absolute bottom-8 left-5 z-10 flex max-w-[280px] items-center gap-3 rounded-2xl card-raised p-4 sm:left-8">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Bell className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-medium">One less thing to remember</span>
          <span className="block text-caption text-muted-foreground">Licence renewal reminder is set.</span>
        </span>
      </div>
    </div>
  )
}

function CommunityPanel() {
  return (
    <div className="relative h-full min-h-[460px] sm:min-h-[500px]">
      <Image
        src="/landing/community.webp"
        alt="A couple and their dog walking through a residential neighbourhood"
        fill
        sizes="(max-width: 1024px) 100vw, 640px"
        className="object-cover"
      />
      <div className="absolute inset-x-5 bottom-5 rounded-2xl bg-card p-5 sm:inset-x-auto sm:left-8 sm:max-w-xs">
        <Users className="h-5 w-5 text-primary" />
        <p className="mt-3 text-[20px] font-medium leading-tight tracking-[-0.03em]">
          A little hello.
          <br />A new walking buddy.
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          Your building’s pet people — posts, lost &amp; found and events — in one friendly place.
        </p>
      </div>
    </div>
  )
}
