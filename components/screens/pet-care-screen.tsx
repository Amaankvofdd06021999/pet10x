"use client"

import { useState } from "react"
import { usePets } from "@/lib/data"
import type { CareKind } from "@/lib/data"
import { toast } from "sonner"
import {
  ArrowLeft,
  Utensils,
  Pill,
  Droplet,
  Footprints,
  Scissors,
  Sparkles,
  Syringe,
  Bell,
  BellOff,
  Plus,
  Check,
  Clock,
  CalendarClock,
} from "lucide-react"

const CARE_KIND: Record<CareKind, { icon: typeof Utensils; color: string; bg: string }> = {
  meal: { icon: Utensils, color: "text-primary", bg: "bg-primary/10" },
  medication: { icon: Pill, color: "text-info", bg: "bg-info/10" },
  water: { icon: Droplet, color: "text-accent", bg: "bg-accent/10" },
  walk: { icon: Footprints, color: "text-success", bg: "bg-success/10" },
  grooming: { icon: Scissors, color: "text-[#9B59B6]", bg: "bg-[#9B59B6]/10" },
  other: { icon: Sparkles, color: "text-muted-foreground", bg: "bg-muted" },
}

interface PetCareScreenProps {
  onBack: () => void
}

export function PetCareScreen({ onBack }: PetCareScreenProps) {
  const { data: pets } = usePets()
  const [activePetId, setActivePetId] = useState<number | undefined>(pets[0]?.id)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [medOverrides, setMedOverrides] = useState<Record<string, boolean>>({})

  const pet = pets.find((p) => p.id === activePetId) ?? pets[0]
  if (!pet) return null

  const routine = pet.careRoutine ?? []
  const feeding = pet.feeding ?? []
  const medications = pet.medications ?? []
  const completed = routine.filter((t) => done.has(t.id)).length
  const pct = routine.length ? Math.round((completed / routine.length) * 100) : 0
  const medOn = (id: string, fallback: boolean) => medOverrides[id] ?? fallback

  const toggleTask = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Reminders = medications with reminders on + expiring vaccinations
  const reminders = [
    ...medications
      .filter((m) => medOn(m.id, m.reminder))
      .map((m) => ({
        key: `med-${m.id}`,
        icon: Pill,
        title: m.name,
        sub: `${m.dosage} · due ${m.nextDue}`,
        urgent: m.nextDue.toLowerCase() === "today",
      })),
    ...(pet.vaccinations ?? [])
      .filter((v) => v.status === "expiring")
      .map((v) => ({
        key: `vax-${v.name}`,
        icon: Syringe,
        title: `${v.name} vaccination`,
        sub: `Expires ${v.expiry}`,
        urgent: true,
      })),
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 px-4 pt-safe backdrop-blur-xl">
        <div className="flex h-12 items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1 text-primary" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[17px]">Back</span>
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-foreground">Pet Care</h1>
        </div>
      </header>

      <main className="ios-scroll flex-1 px-4 pb-24 pt-4">
        {/* Pet switcher */}
        {pets.length > 1 && (
          <div className="mb-4 flex gap-2">
            {pets.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setActivePetId(p.id)
                  setDone(new Set())
                }}
                className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${
                  p.id === pet.id ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Today's progress */}
        <section className="mb-5 rounded-2xl bg-primary p-4 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-medium opacity-80">Today&apos;s care · {pet.name}</p>
              <p className="text-[28px] font-semibold leading-tight">
                {completed}<span className="text-[16px] font-medium opacity-80">/{routine.length} done</span>
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-foreground/20">
              <span className="text-[14px] font-semibold">{pct}%</span>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary-foreground/25">
            <div className="h-full rounded-full bg-primary-foreground transition-all" style={{ width: `${pct}%` }} />
          </div>
        </section>

        {/* Today checklist */}
        <section className="mb-6">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-foreground">Today&apos;s Routine</h2>
            <button
              onClick={() => toast.success("Care task added", { description: "Reminder scheduled for today." })}
              className="flex items-center gap-1 text-[13px] font-semibold text-primary"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {routine.map((task) => {
              const cfg = CARE_KIND[task.kind]
              const Icon = cfg.icon
              const isDone = done.has(task.id)
              return (
                <button
                  key={task.id}
                  onClick={() => toggleTask(task.id)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.99] ${
                    isDone ? "border-success/30 bg-success/5" : "border-border bg-card"
                  }`}
                >
                  <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                    <Icon className={`h-5 w-5 ${cfg.color}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[14px] font-semibold ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {task.label}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {task.time}
                      {task.detail && <span>· {task.detail}</span>}
                    </div>
                  </div>
                  <span
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isDone ? "border-success bg-success text-success-foreground" : "border-border"
                    }`}
                  >
                    {isDone && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Reminders */}
        {reminders.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2.5 text-[15px] font-semibold text-foreground">Upcoming Reminders</h2>
            <div className="flex flex-col gap-2">
              {reminders.map((r) => {
                const Icon = r.icon
                return (
                  <div
                    key={r.key}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      r.urgent ? "border-warning/30 bg-warning/5" : "border-border bg-card"
                    }`}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${r.urgent ? "bg-warning/15" : "bg-info/10"}`}>
                      <Icon className={`h-4.5 w-4.5 ${r.urgent ? "text-[#B8860B]" : "text-info"}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-foreground">{r.title}</p>
                      <p className="text-[12px] text-muted-foreground">{r.sub}</p>
                    </div>
                    <CalendarClock className={`h-4 w-4 ${r.urgent ? "text-[#B8860B]" : "text-muted-foreground"}`} />
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Feeding schedule */}
        <section className="mb-6">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-foreground">Feeding Schedule</h2>
            <button
              onClick={() => toast.success("Meal added to schedule")}
              className="flex items-center gap-1 text-[13px] font-semibold text-primary"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {feeding.map((meal, i) => (
              <div
                key={meal.id}
                className={`flex items-center gap-3 p-3 ${i < feeding.length - 1 ? "border-b border-border" : ""}`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Utensils className="h-4 w-4 text-primary" />
                </span>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-foreground">{meal.name}</p>
                  <p className="text-[12px] text-muted-foreground">{meal.portion} · {meal.food}</p>
                </div>
                <span className="text-[13px] font-medium text-muted-foreground">{meal.time}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Medications */}
        <section className="mb-4">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-foreground">Medications</h2>
            <button
              onClick={() => toast.success("Medication added")}
              className="flex items-center gap-1 text-[13px] font-semibold text-primary"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          {medications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
              <Pill className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-[13px] text-muted-foreground">No medications tracked</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {medications.map((m) => {
                const on = medOn(m.id, m.reminder)
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10">
                      <Pill className="h-4 w-4 text-info" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-foreground">{m.name}</p>
                      <p className="text-[12px] text-muted-foreground">{m.dosage} · {m.frequency} · next {m.nextDue}</p>
                    </div>
                    <button
                      onClick={() => {
                        setMedOverrides((prev) => ({ ...prev, [m.id]: !on }))
                        toast(on ? "Reminder turned off" : "Reminder turned on")
                      }}
                      aria-label={on ? "Turn off reminder" : "Turn on reminder"}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                        on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {on ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
