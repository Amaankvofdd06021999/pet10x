"use client"

import { useState } from "react"
import { usePets, useCareEntries, useCareTargets, addCareEntry, deleteCareEntry, setCareTarget } from "@/lib/data"
import type { CareEntry, CareEntryKind } from "@/lib/data"
import { toast } from "sonner"
import {
  ArrowLeft,
  Utensils,
  Pill,
  Cookie,
  Plus,
  Trash2,
  Loader2,
  Target,
  PawPrint,
} from "lucide-react"

interface TabConfig {
  kind: CareEntryKind
  label: string
  icon: typeof Utensils
  color: string
  bg: string
  unit: string
  defaultLabel: string
  placeholder: string
  quick: number[]
  targetLabel: string
  step: string
}

const TABS: TabConfig[] = [
  {
    kind: "food",
    label: "Food",
    icon: Utensils,
    color: "text-primary",
    bg: "bg-primary/10",
    unit: "cups",
    defaultLabel: "Meal",
    placeholder: "Breakfast, kibble…",
    quick: [0.5, 1, 1.5],
    targetLabel: "Daily target",
    step: "0.25",
  },
  {
    kind: "medicine",
    label: "Medicine",
    icon: Pill,
    color: "text-info",
    bg: "bg-info/10",
    unit: "dose",
    defaultLabel: "Medication",
    placeholder: "Heartworm tablet…",
    quick: [1],
    targetLabel: "Doses / day",
    step: "1",
  },
  {
    kind: "treat",
    label: "Treats",
    icon: Cookie,
    color: "text-accent",
    bg: "bg-accent/10",
    unit: "treats",
    defaultLabel: "Treat",
    placeholder: "Dental chew…",
    quick: [1, 2],
    targetLabel: "Daily limit",
    step: "1",
  },
]

interface PetCareScreenProps {
  onBack: () => void
  onNavigate?: (screen: string) => void
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const that = new Date(d)
  that.setHours(0, 0, 0, 0)
  const diff = Math.round((startOfToday() - that.getTime()) / 86_400_000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

export function PetCareScreen({ onBack, onNavigate }: PetCareScreenProps) {
  const { data: pets, isLoading: petsLoading } = usePets()
  const [activePetId, setActivePetId] = useState<string | undefined>(undefined)
  const petId = activePetId ?? pets[0]?.id
  const pet = pets.find((p) => p.id === petId) ?? pets[0]

  const [kind, setKind] = useState<CareEntryKind>("food")
  const tab = TABS.find((t) => t.kind === kind)!

  const { data: entries, isLoading: entriesLoading, refetch } = useCareEntries(petId, kind)
  const { data: targets, refetch: refetchTargets } = useCareTargets(petId)

  const [label, setLabel] = useState("")
  const [amount, setAmount] = useState("")
  const [saving, setSaving] = useState(false)

  const [editingTarget, setEditingTarget] = useState(false)
  const [targetInput, setTargetInput] = useState("")

  // ---- Empty: no pets yet ----
  if (!petsLoading && pets.length === 0) {
    return (
      <ScreenShell onBack={onBack}>
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <PawPrint className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-[18px] font-semibold text-foreground">No pets yet</h2>
          <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
            Add a pet to start tracking food, medicine and treats — every entry is saved to your account.
          </p>
          <button
            onClick={() => onNavigate?.("add-pet")}
            className="mt-5 flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            <Plus className="h-4.5 w-4.5" /> Add a pet
          </button>
        </div>
      </ScreenShell>
    )
  }

  const todayStart = startOfToday()
  const todayEntries = entries.filter((e) => new Date(e.loggedAt).getTime() >= todayStart)
  const todayTotal = todayEntries.reduce((s, e) => s + (e.amount ?? 0), 0)
  const target = targets[kind]?.targetAmount ?? null
  const pct = target ? Math.min(100, Math.round((todayTotal / target) * 100)) : 0
  const overLimit = target != null && kind === "treat" && todayTotal > target

  async function log(amt: number | null) {
    if (!petId) return
    if (amt == null) {
      toast.error("Enter an amount to log.")
      return
    }
    setSaving(true)
    const { error } = await addCareEntry({
      petId,
      kind,
      label: label.trim() || tab.defaultLabel,
      amount: amt,
      unit: tab.unit,
    })
    setSaving(false)
    if (error) {
      toast.error("Couldn't save", { description: error })
      return
    }
    toast.success(`${tab.label} logged`, { description: `${amt} ${tab.unit} · ${label.trim() || tab.defaultLabel}` })
    setAmount("")
    setLabel("")
    refetch()
  }

  async function removeEntry(e: CareEntry) {
    const { error } = await deleteCareEntry(e.id)
    if (error) {
      toast.error("Couldn't remove", { description: error })
      return
    }
    toast("Entry removed")
    refetch()
  }

  async function saveTarget() {
    if (!petId) return
    const value = targetInput ? parseFloat(targetInput) : null
    const { error } = await setCareTarget(petId, kind, value, tab.unit)
    if (error) {
      toast.error("Couldn't save target", { description: error })
      return
    }
    setEditingTarget(false)
    toast.success("Target updated")
    refetchTargets()
  }

  // group all entries by day for the history list
  const groups: { label: string; items: CareEntry[] }[] = []
  for (const e of entries) {
    const l = dayLabel(e.loggedAt)
    const last = groups[groups.length - 1]
    if (last && last.label === l) last.items.push(e)
    else groups.push({ label: l, items: [e] })
  }

  return (
    <ScreenShell onBack={onBack} title="Trackers">
      <main className="ios-scroll flex-1 px-4 pb-24 pt-4">
        {/* Pet switcher */}
        {pets.length > 1 && (
          <div className="mb-4 flex gap-2 overflow-x-auto">
            {pets.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePetId(p.id)}
                className={`flex-shrink-0 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${
                  p.id === pet?.id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Tracker tabs */}
        <div className="mb-4 flex rounded-xl bg-muted p-1">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.kind}
                onClick={() => {
                  setKind(t.kind)
                  setEditingTarget(false)
                  setAmount("")
                  setLabel("")
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition-all ${
                  kind === t.kind ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            )
          })}
        </div>

        {/* Today summary */}
        <section className={`mb-5 rounded-2xl p-4 ${overLimit ? "bg-destructive" : "bg-primary"} text-primary-foreground`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[12px] font-medium opacity-80">
                {tab.label} today · {pet?.name}
              </p>
              <p className="text-[28px] font-semibold leading-tight">
                {todayTotal}
                <span className="text-[15px] font-medium opacity-80">
                  {" "}
                  {tab.unit}
                  {target != null && ` / ${target}`}
                </span>
              </p>
              {overLimit && <p className="mt-0.5 text-[12px] font-medium">Over the daily limit</p>}
            </div>
            <button
              onClick={() => {
                setEditingTarget((v) => !v)
                setTargetInput(target != null ? String(target) : "")
              }}
              className="flex items-center gap-1 rounded-full bg-primary-foreground/20 px-2.5 py-1 text-[11px] font-semibold"
            >
              <Target className="h-3 w-3" /> {target != null ? "Edit" : "Set"} target
            </button>
          </div>
          {target != null && !editingTarget && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary-foreground/25">
              <div className="h-full rounded-full bg-primary-foreground transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          {editingTarget && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                placeholder={tab.targetLabel}
                className="min-w-0 flex-1 rounded-lg bg-primary-foreground/20 px-3 py-2 text-[14px] font-semibold text-primary-foreground placeholder:text-primary-foreground/60 focus:outline-none"
              />
              <button
                onClick={saveTarget}
                className="rounded-lg bg-primary-foreground px-3 py-2 text-[13px] font-semibold text-primary"
              >
                Save
              </button>
            </div>
          )}
        </section>

        {/* Quick log */}
        <section className="mb-6 rounded-2xl border border-border bg-card p-3.5">
          <h2 className="mb-2.5 text-[14px] font-semibold text-foreground">Log {tab.label.toLowerCase()}</h2>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={tab.placeholder}
            className="mb-2 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                inputMode="decimal"
                step={tab.step}
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-3.5 pr-14 text-[14px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-medium text-muted-foreground">
                {tab.unit}
              </span>
            </div>
            <button
              onClick={() => log(amount ? parseFloat(amount) : null)}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[14px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Log
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {tab.quick.map((q) => (
              <button
                key={q}
                onClick={() => log(q)}
                disabled={saving}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors active:bg-muted disabled:opacity-60"
              >
                + {q} {tab.unit}
              </button>
            ))}
          </div>
        </section>

        {/* History */}
        <section>
          <h2 className="mb-2.5 text-[15px] font-semibold text-foreground">History</h2>
          {entriesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-7 text-center">
              <tab.icon className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-[13px] text-muted-foreground">No {tab.label.toLowerCase()} logged yet</p>
              <p className="text-[12px] text-muted-foreground">Log your first entry above.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => (
                <div key={g.label}>
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                  <div className="overflow-hidden rounded-xl border border-border bg-card">
                    {g.items.map((e, i) => (
                      <div
                        key={e.id}
                        className={`flex items-center gap-3 p-3 ${i < g.items.length - 1 ? "border-b border-border" : ""}`}
                      >
                        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${tab.bg}`}>
                          <tab.icon className={`h-4 w-4 ${tab.color}`} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-foreground">{e.label || tab.defaultLabel}</p>
                          <p className="text-[12px] text-muted-foreground">
                            {e.amount != null && `${e.amount} ${e.unit ?? tab.unit} · `}
                            {timeLabel(e.loggedAt)}
                          </p>
                        </div>
                        <button
                          onClick={() => removeEntry(e)}
                          aria-label="Remove entry"
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </ScreenShell>
  )
}

function ScreenShell({ children, onBack, title }: { children: React.ReactNode; onBack: () => void; title?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 px-4 pt-safe backdrop-blur-xl">
        <div className="flex h-12 items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1 text-primary" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[17px]">Back</span>
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-foreground">
            {title ?? "Trackers"}
          </h1>
        </div>
      </header>
      {children}
    </div>
  )
}
