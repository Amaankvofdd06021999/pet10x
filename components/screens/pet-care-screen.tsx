"use client"

import { useState } from "react"
import {
  usePets,
  useCareEntries,
  useCareTargets,
  addCareEntry,
  deleteCareEntry,
  upsertCareTarget,
  deleteCareTarget,
} from "@/lib/data"
import type { CareEntry, CareEntryKind, CareTarget, Species } from "@/lib/data"
import { careKindsFor, unitById, type CareKindSpec, type CareUnit } from "@/lib/data/care-catalog"
import { toast } from "sonner"
import { ScheduleTab } from "@/components/screens/care/schedule-tab"
import {
  ArrowLeft,
  Utensils,
  Pill,
  Cookie,
  Footprints,
  Sparkles,
  Trees,
  Droplets,
  Scale,
  CircleDot,
  Plus,
  Trash2,
  Loader2,
  Target,
  PawPrint,
  X,
} from "lucide-react"

/**
 * Presentation for a care kind. The *vocabulary* — which kinds a species has
 * and what units they use — comes from `care-catalog`, because that is a
 * question about the animal. This is only how each one looks.
 */
const KIND_STYLE: Record<string, { icon: typeof Utensils; color: string; bg: string }> = {
  food: { icon: Utensils, color: "text-primary", bg: "bg-primary/10" },
  water: { icon: Droplets, color: "text-accent", bg: "bg-accent/10" },
  treat: { icon: Cookie, color: "text-accent", bg: "bg-accent/10" },
  medicine: { icon: Pill, color: "text-destructive", bg: "bg-destructive/10" },
  walk: { icon: Footprints, color: "text-success", bg: "bg-success/10" },
  play: { icon: Sparkles, color: "text-success", bg: "bg-success/10" },
  outing: { icon: Trees, color: "text-success", bg: "bg-success/10" },
  potty: { icon: CircleDot, color: "text-muted-foreground", bg: "bg-muted" },
  weight: { icon: Scale, color: "text-foreground", bg: "bg-muted" },
}

const styleFor = (kind: string) => KIND_STYLE[kind] ?? KIND_STYLE.food

interface PetCareScreenProps {
  onBack: () => void
  onNavigate?: (screen: string) => void
  /** Tab to open on, when arriving from a Today's Care tile. */
  initialKind?: string
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

export function PetCareScreen({ onBack, onNavigate, initialKind }: PetCareScreenProps) {
  const { data: pets, isLoading: petsLoading } = usePets()
  const [activePetId, setActivePetId] = useState<string | undefined>(undefined)
  const petId = activePetId ?? pets[0]?.id
  const pet = pets.find((p) => p.id === petId) ?? pets[0]

  /**
   * Which kinds exist depends on the animal. A cat has playtime, not walks; a
   * fish has neither, nor treats. `careKindsFor` is the single answer.
   */
  const kinds: CareKindSpec[] = careKindsFor(pet?.species)

  const [kind, setKind] = useState<CareEntryKind>(
    (initialKind as CareEntryKind) ?? "food",
  )
  // The pet can change under us (switcher), and the new species may not have
  // the kind that was selected — fall back rather than render a blank tab.
  const spec: CareKindSpec = kinds.find((k) => k.kind === kind) ?? kinds[0]
  const activeKind = spec.kind as CareEntryKind

  const { data: entries, isLoading: entriesLoading, refetch } = useCareEntries(petId, activeKind)
  const { data: allTargets, refetch: refetchTargets } = useCareTargets(petId)
  const targets = allTargets.filter((t) => t.kind === activeKind && t.isActive)

  const [label, setLabel] = useState("")
  const [amount, setAmount] = useState("")
  /**
   * The chosen unit, scoped to the pet AND kind it was chosen for.
   *
   * Plain state was wrong: it initialised from whichever pet happened to be
   * first and then survived every switch, so selecting a cat showed its food
   * in "bowls" — the dog's default — instead of cans. Keying the override
   * means it falls back to the species default the moment either changes,
   * with no effect to keep in sync.
   */
  const [unitOverride, setUnitOverride] = useState<{ key: string; id: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // "log" records what happened; "schedule" plans what should.
  const [view, setView] = useState<"log" | "schedule">("log")
  const [targetSheet, setTargetSheet] = useState(false)

  const unitKey = `${petId ?? ""}:${activeKind}`
  const unitId = unitOverride?.key === unitKey ? unitOverride.id : (spec.units[0]?.id ?? "")
  const setUnitId = (id: string) => setUnitOverride({ key: unitKey, id })
  const unit: CareUnit = unitById(pet?.species, activeKind, unitId || null)

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

  /**
   * Progress per target, not one aggregate.
   *
   * A pet on two medicines has two goals; summing them into "3 of 4 doses"
   * would say nothing about whether either was actually given. Entries match a
   * target by label, case-insensitively, which is how they are typed.
   */
  const progressFor = (t: CareTarget) => {
    const done = todayEntries
      .filter((e) => (e.label ?? "").trim().toLowerCase() === t.label.trim().toLowerCase())
      .reduce((sum, e) => sum + (e.amount ?? 0), 0)
    const goal = t.targetAmount ?? 0
    return {
      done,
      goal,
      pct: goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0,
      // Treats are a ceiling, everything else a floor.
      over: activeKind === "treat" && goal > 0 && done > goal,
    }
  }

  // The headline is the day's total across the kind, which is meaningful even
  // when no target is set.
  const todayTotal = todayEntries.reduce((s, e) => s + (e.amount ?? 0), 0)

  async function log(amt: number | null) {
    if (!petId) return
    if (amt == null || Number.isNaN(amt)) {
      toast.error("Enter an amount to log.")
      return
    }
    setSaving(true)
    const entryLabel = label.trim() || spec.defaultLabel
    const { error } = await addCareEntry({
      petId,
      kind: activeKind,
      label: entryLabel,
      amount: amt,
      unit: unit.id,
    })
    setSaving(false)
    if (error) {
      toast.error("Couldn't save", { description: error })
      return
    }
    toast.success(`${spec.label} logged`, { description: `${amt} ${unit.label} · ${entryLabel}` })
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

        {/* Log vs plan */}
        <div className="mb-3 flex rounded-xl bg-muted p-1">
          {(["log", "schedule"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors ${
                view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {v === "log" ? "Log" : "Schedule"}
            </button>
          ))}
        </div>

        {/* Tracker tabs — one per kind this species actually has. Scrollable
            because a dog has eight and a fish has two. */}
        <div className={`no-scrollbar mb-4 flex gap-1.5 overflow-x-auto ${view === "schedule" ? "hidden" : ""}`}>
          {kinds.map((k) => {
            const { icon: Icon } = styleFor(k.kind)
            const on = activeKind === k.kind
            return (
              <button
                key={k.kind}
                onClick={() => {
                  setKind(k.kind as CareEntryKind)
                  setAmount("")
                  setLabel("")
                }}
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-all ${
                  on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {k.label}
              </button>
            )
          })}
        </div>

        {view === "schedule" ? (
          <ScheduleTab petId={petId} petName={pet?.name} species={pet?.species} />
        ) : (
          <>
          {/* Today */}
          <section className="mb-4 rounded-2xl bg-primary p-4 text-primary-foreground">
            <p className="text-[12px] font-medium opacity-80">
              {spec.label} today · {pet?.name}
            </p>
            <p className="text-[28px] font-semibold leading-tight">
              {todayTotal}
              <span className="text-[15px] font-medium opacity-80"> {unit.label}</span>
            </p>
          </section>

          {/* Targets — a list, because medicines and treats come in more than
              one and a single row could only ever describe the first. */}
          <section className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-foreground">{spec.targetLabel}</h2>
              <button
                onClick={() => setTargetSheet(true)}
                className="flex items-center gap-1 text-[13px] font-semibold text-primary"
              >
                <Target className="h-3.5 w-3.5" /> {spec.multi ? "Add" : targets.length ? "Edit" : "Set"}
              </button>
            </div>

            {targets.length === 0 ? (
              <button
                onClick={() => setTargetSheet(true)}
                className="w-full rounded-xl border border-dashed border-border bg-card p-3 text-center text-[12.5px] text-muted-foreground"
              >
                No target set{spec.multi ? " — add one per item" : ""}.
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                {targets.map((t) => {
                  const pr = progressFor(t)
                  return (
                    <div key={t.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-[13.5px] font-semibold text-foreground">{t.label}</p>
                        <p className={`flex-shrink-0 text-[12px] font-semibold ${pr.over ? "text-destructive" : "text-muted-foreground"}`}>
                          {pr.done} / {pr.goal} {unitById(pet?.species, activeKind, t.unit ?? null).label}
                          {t.period === "week" ? " / wk" : ""}
                        </p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${pr.over ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${pr.pct}%` }}
                        />
                      </div>
                      {pr.over && <p className="mt-1.5 text-[11.5px] font-medium text-destructive">Over the daily limit</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Quick log */}
          <section className="mb-6 rounded-2xl border border-border bg-card p-3.5">
            <h2 className="mb-2.5 text-[14px] font-semibold text-foreground">Log {spec.label.toLowerCase()}</h2>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={spec.placeholder}
              list={`targets-${activeKind}`}
              className="mb-2 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {/* Existing targets as suggestions, so a logged entry lands on the
                goal it belongs to instead of near-missing it by a typo. */}
            <datalist id={`targets-${activeKind}`}>
              {targets.map((t) => (
                <option key={t.id} value={t.label} />
              ))}
            </datalist>

            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step={unit.step}
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {/* Unit is a choice, not a constant: a dog's meal is bowls or
                  grams depending on the household, and both are correct. */}
              {spec.units.length > 1 ? (
                <select
                  value={unit.id}
                  onChange={(e) => setUnitId(e.target.value)}
                  aria-label="Unit"
                  className="flex-shrink-0 rounded-xl border border-border bg-background px-2.5 py-2.5 text-[13px] font-medium text-foreground focus:border-primary focus:outline-none"
                >
                  {spec.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="flex-shrink-0 text-[12px] font-medium text-muted-foreground">{unit.label}</span>
              )}
              <button
                onClick={() => log(amount ? parseFloat(amount) : null)}
                disabled={saving}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[14px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Log
              </button>
            </div>
            {unit.quick.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {unit.quick.map((q) => (
                  <button
                    key={q}
                    onClick={() => log(q)}
                    disabled={saving}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors active:bg-muted disabled:opacity-60"
                  >
                    + {q} {unit.label}
                  </button>
                ))}
              </div>
            )}
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
                {(() => { const I = styleFor(activeKind).icon; return <I className="mx-auto h-6 w-6 text-muted-foreground" /> })()}
                <p className="mt-2 text-[13px] text-muted-foreground">No {spec.label.toLowerCase()} logged yet</p>
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
                          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${styleFor(activeKind).bg}`}>
                            {(() => { const I = styleFor(activeKind).icon; return <I className={`h-4 w-4 ${styleFor(activeKind).color}`} /> })()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-foreground">{e.label || spec.defaultLabel}</p>
                            <p className="text-[12px] text-muted-foreground">
                              {e.amount != null && `${e.amount} ${unitById(pet?.species, activeKind, e.unit ?? null).label} · `}
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
          </>
        )}
      </main>

      {targetSheet && (
        <TargetSheet
          petId={petId!}
          spec={spec}
          kind={activeKind}
          species={pet?.species}
          existing={targets}
          onClose={() => setTargetSheet(false)}
          onSaved={() => {
            setTargetSheet(false)
            refetchTargets()
          }}
        />
      )}
    </ScreenShell>
  )
}

/**
 * Add or edit the goals for one care kind.
 *
 * A list rather than a single field, because the kinds owners care most about
 * tracking — medicines, treats — are inherently plural. Two medications used
 * to mean one of them silently replacing the other.
 */
function TargetSheet({
  petId,
  spec,
  kind,
  species,
  existing,
  onClose,
  onSaved,
}: {
  petId: string
  spec: CareKindSpec
  kind: CareEntryKind
  species?: Species
  existing: CareTarget[]
  onClose: () => void
  onSaved: () => void
}) {
  // Single-target kinds prefill from the one that exists, so the sheet reads
  // as "edit" rather than "add a second daily food goal".
  const one = !spec.multi ? existing[0] : undefined
  const [label, setLabel] = useState(one?.label ?? (spec.multi ? "" : spec.defaultLabel))
  const [amount, setAmount] = useState(one?.targetAmount != null ? String(one.targetAmount) : "")
  const [unitId, setUnitId] = useState(one?.unit ?? spec.units[0]?.id ?? "")
  const [period, setPeriod] = useState<"day" | "week">(one?.period ?? "day")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!label.trim()) return toast.error("Give the target a name.")
    const value = amount ? parseFloat(amount) : null
    if (value == null || Number.isNaN(value)) return toast.error("Enter a target amount.")
    setSaving(true)
    const { error } = await upsertCareTarget({ petId, kind, label, targetAmount: value, unit: unitId, period })
    setSaving(false)
    if (error) return toast.error("Couldn't save target", { description: error })
    toast.success("Target saved")
    onSaved()
  }

  async function remove(id: string) {
    const { error } = await deleteCareTarget(id)
    if (error) return toast.error("Couldn't remove", { description: error })
    toast("Target removed")
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-label={`${spec.targetLabel} for ${spec.label}`}
        className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl sm:pb-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-foreground">{spec.targetLabel}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {spec.multi && existing.length > 0 && (
          <div className="mb-4 flex flex-col gap-1.5">
            {existing.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{t.label}</span>
                <span className="flex-shrink-0 text-[12px] text-muted-foreground">
                  {t.targetAmount} {unitById(species, kind, t.unit ?? null).label}
                </span>
                <button
                  onClick={() => remove(t.id)}
                  aria-label={`Remove ${t.label}`}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={spec.placeholder}
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step={unitById(species, kind, unitId).step}
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              aria-label="Unit"
              className="flex-shrink-0 rounded-xl border border-border bg-background px-2.5 py-2.5 text-[13px] font-medium text-foreground focus:border-primary focus:outline-none"
            >
              {spec.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as "day" | "week")}
              aria-label="Per"
              className="flex-shrink-0 rounded-xl border border-border bg-background px-2.5 py-2.5 text-[13px] font-medium text-foreground focus:border-primary focus:outline-none"
            >
              <option value="day">/ day</option>
              <option value="week">/ week</option>
            </select>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {spec.multi ? "Add target" : "Save target"}
          </button>
        </div>
      </div>
    </div>
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
