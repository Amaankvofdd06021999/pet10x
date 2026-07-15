"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  useBuildingPets,
  useBuildingResidents,
  approveResidentLink,
  denyResidentLink,
  removeResident,
  useViolations,
  useResolvedViolations,
} from "@/lib/data"
import { advanceViolation, resolveViolation } from "@/lib/data/manager-queues"
import {
  useEmergencyTokens,
  issueEmergencyToken,
  revokeEmergencyToken,
} from "@/lib/data/manager"
import { useComplianceInputs } from "@/lib/data/portfolio"
import { useStrata } from "./portal-context"
import { WorkQueueScreen } from "./queue-screen"
import { BuildingBylawsEditor } from "./bylaws-editor"
import { StatTile, SectionCard, Spinner, EmptyState } from "./strata-ui"
import {
  ArrowLeft,
  Inbox,
  Users,
  Gavel,
  Scale,
  QrCode,
  Check,
  X,
  UserMinus,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Copy,
  Ban,
  Plus,
} from "lucide-react"

const DETAIL_TABS = [
  { id: "work", label: "Work", icon: Inbox },
  { id: "residents", label: "Residents", icon: Users },
  { id: "violations", label: "Violations", icon: Gavel },
  { id: "bylaws", label: "Bylaws", icon: Scale },
  { id: "emergency", label: "Emergency", icon: QrCode },
] as const

export function BuildingDetail({ buildingId, onBack }: { buildingId: string; onBack: () => void }) {
  const { buildings } = useStrata()
  const building = buildings.find((b) => b.id === buildingId)
  const { data: pets } = useBuildingPets()
  const [tab, setTab] = useState<(typeof DETAIL_TABS)[number]["id"]>("work")

  const scopedPets = pets.filter((p) => p.buildingId === buildingId)
  const compliance = scopedPets.length
    ? Math.round(scopedPets.reduce((s, p) => s + p.compliancePct, 0) / scopedPets.length)
    : 100

  if (!building) {
    return (
      <div className="space-y-4">
        <BackBtn onBack={onBack} />
        <EmptyState icon={<Ban className="h-8 w-8" />} title="Building not found" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BackBtn onBack={onBack} />

      <div>
        <h2 className="text-[20px] font-bold tracking-tight text-foreground">{building.name}</h2>
        <p className="text-[12.5px] text-muted-foreground">
          {building.code}
          {building.city ? ` · ${building.city}` : ""}
          {building.region ? `, ${building.region}` : ""}
          {building.totalUnits ? ` · ${building.totalUnits} units` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Compliance"
          value={`${compliance}%`}
          tone={compliance < 75 ? "destructive" : compliance < 90 ? "warning" : "success"}
        />
        <StatTile label="Pets" value={scopedPets.length} />
        <StatTile label="Non-compliant" value={scopedPets.filter((p) => p.compliancePct < 100).length} />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {DETAIL_TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                active ? "bg-card text-info shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === "work" && <WorkQueueScreen scopeOverride={buildingId} />}
      {tab === "residents" && <ResidentsPanel buildingId={buildingId} />}
      {tab === "violations" && <ViolationsPanel buildingId={buildingId} />}
      {tab === "bylaws" && <BylawsPanel buildingId={buildingId} />}
      {tab === "emergency" && <EmergencyPanel buildingId={buildingId} />}
    </div>
  )
}

function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> All buildings
    </button>
  )
}

/* ------------------------------- Residents ------------------------------- */

function ResidentsPanel({ buildingId }: { buildingId: string }) {
  const { data, isLoading, refetch } = useBuildingResidents()
  const [busy, setBusy] = useState<string | null>(null)
  const scoped = data.filter((r) => r.buildingId === buildingId)
  const pending = scoped.filter((r) => r.status === "pending")
  const members = scoped.filter((r) => r.status === "approved")

  async function act(linkId: string, fn: (id: string) => Promise<{ error: string | null }>, label: string) {
    setBusy(linkId)
    const { error } = await fn(linkId)
    setBusy(null)
    if (error) return toast.error(`${label} failed`, { description: error })
    toast.success(label)
    refetch()
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <SectionCard title={`Pending requests (${pending.length})`}>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.linkId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{r.residentName}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{r.residentEmail ?? "—"}</p>
                </div>
                <button
                  onClick={() => act(r.linkId, approveResidentLink, "Approved")}
                  disabled={busy === r.linkId}
                  className="flex items-center gap-1 rounded-lg bg-success/15 px-3 py-1.5 text-[12px] font-semibold text-success disabled:opacity-50"
                >
                  {busy === r.linkId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Approve
                </button>
                <button
                  onClick={() => act(r.linkId, denyResidentLink, "Denied")}
                  disabled={busy === r.linkId}
                  className="flex items-center gap-1 rounded-lg bg-destructive/10 px-3 py-1.5 text-[12px] font-semibold text-destructive disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Deny
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title={`Members (${members.length})`}>
        {members.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">No approved residents yet.</p>
        ) : (
          <div className="space-y-2">
            {members.map((r) => (
              <div key={r.linkId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-info/15 text-[13px] font-semibold text-info">
                  {r.residentName.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{r.residentName}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {r.unit ? `Unit ${r.unit} · ` : ""}
                    {r.residentEmail ?? "—"}
                  </p>
                </div>
                <button
                  onClick={() => act(r.linkId, removeResident, "Resident removed")}
                  disabled={busy === r.linkId}
                  title="Remove from building"
                  className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground disabled:opacity-50"
                >
                  {busy === r.linkId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

/* ------------------------------- Violations ------------------------------ */

const LADDER = ["investigation", "pending_review", "verbal_warning", "written_warning", "fine_issued"] as const
const APP_TO_DB: Record<string, (typeof LADDER)[number]> = {
  investigation: "investigation",
  "pending-review": "pending_review",
  "verbal-warning": "verbal_warning",
  "written-warning": "written_warning",
  "fine-issued": "fine_issued",
}
const DB_LABEL: Record<string, string> = {
  pending_review: "Pending review",
  verbal_warning: "Verbal warning",
  written_warning: "Written warning",
  fine_issued: "Fine issued",
}
function nextStage(appStage: string): (typeof LADDER)[number] | null {
  const db = APP_TO_DB[appStage]
  const i = LADDER.indexOf(db)
  return i >= 0 && i < LADDER.length - 1 ? LADDER[i + 1] : null
}

function ViolationsPanel({ buildingId }: { buildingId: string }) {
  const { data: open, isLoading, refetch } = useViolations()
  const { data: resolved, refetch: refetchResolved } = useResolvedViolations()
  const [busy, setBusy] = useState<string | null>(null)

  const scopedOpen = open.filter((v) => v.buildingId === buildingId)
  const scopedResolved = resolved.filter((v) => v.buildingId === buildingId)

  async function advance(id: string, appStage: string) {
    const next = nextStage(appStage)
    if (!next) return
    setBusy(id)
    const { error } = await advanceViolation(id, next)
    setBusy(null)
    if (error) return toast.error("Couldn't advance", { description: error })
    toast.success(`Advanced to ${DB_LABEL[next]}`)
    refetch()
  }
  async function resolve(id: string) {
    setBusy(id)
    const { error } = await resolveViolation(id, "Remedied — closed by manager")
    setBusy(null)
    if (error) return toast.error("Couldn't resolve", { description: error })
    toast.success("Violation resolved")
    refetch()
    refetchResolved()
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <SectionCard title={`Open violations (${scopedOpen.length})`}>
        {scopedOpen.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">No open violations.</p>
        ) : (
          <div className="space-y-2">
            {scopedOpen.map((v) => {
              const next = nextStage(v.stage)
              return (
                <div key={v.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold capitalize text-foreground">{v.type}</p>
                      <p className="text-[12px] text-muted-foreground">
                        Unit {v.unit} · {v.resident} · {v.date}
                      </p>
                    </div>
                    <span className="whitespace-nowrap rounded-md bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                      {v.stageLabel}
                    </span>
                  </div>
                  {v.amount > 0 && (
                    <p className="mt-1 text-[12px] font-medium text-foreground">
                      Fine ${v.amount.toFixed(2)} · {v.paid ? "paid" : "unpaid"}
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {next && (
                      <button
                        onClick={() => advance(v.id, v.stage)}
                        disabled={busy === v.id}
                        className="flex items-center gap-1 rounded-lg bg-info/15 px-2.5 py-1.5 text-[12px] font-semibold text-info disabled:opacity-50"
                      >
                        {busy === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                        Advance to {DB_LABEL[next]}
                      </button>
                    )}
                    <button
                      onClick={() => resolve(v.id)}
                      disabled={busy === v.id}
                      className="flex items-center gap-1 rounded-lg bg-success/15 px-2.5 py-1.5 text-[12px] font-semibold text-success disabled:opacity-50"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" /> Resolve
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {scopedResolved.length > 0 && (
        <SectionCard title={`Resolved (${scopedResolved.length})`}>
          <div className="space-y-1.5">
            {scopedResolved.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <span className="truncate text-[12.5px] capitalize text-foreground">
                  {v.type} · Unit {v.unit}
                </span>
                <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                  {v.outcome} · {v.resolved}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

/* --------------------------------- Bylaws -------------------------------- */

function BylawsPanel({ buildingId }: { buildingId: string }) {
  const { buildings, refetch } = useStrata()
  const { data: inputs, refetch: refetchInputs } = useComplianceInputs()
  const building = buildings.find((b) => b.id === buildingId)
  if (!building) return null
  const pets = inputs.filter((p) => p.buildingId === buildingId)
  return (
    <SectionCard title="Pet bylaws">
      <BuildingBylawsEditor
        building={building}
        pets={pets}
        onSaved={() => {
          refetch()
          refetchInputs()
        }}
      />
    </SectionCard>
  )
}

/* ------------------------------- Emergency ------------------------------- */

function EmergencyPanel({ buildingId }: { buildingId: string }) {
  const { data: tokens, isLoading, refetch } = useEmergencyTokens(buildingId)
  const [busy, setBusy] = useState(false)

  async function issue() {
    setBusy(true)
    const { error } = await issueEmergencyToken(buildingId, 4)
    setBusy(false)
    if (error) return toast.error("Couldn't issue token", { description: error })
    toast.success("4-hour emergency link issued")
    refetch()
  }
  async function revoke(id: string) {
    const { error } = await revokeEmergencyToken(id)
    if (error) return toast.error("Couldn't revoke", { description: error })
    toast.success("Token revoked")
    refetch()
  }
  function copy(token: string) {
    const url = `${window.location.origin}/emergency/${token}`
    void navigator.clipboard.writeText(url)
    toast.success("Emergency link copied")
  }

  return (
    <SectionCard
      title="Emergency access links"
      action={
        <button
          onClick={issue}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-info px-3 py-1.5 text-[12px] font-semibold text-info-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Issue 4h link
        </button>
      }
    >
      <p className="mb-3 text-[12.5px] text-muted-foreground">
        Time-boxed links let fire/emergency crews see the building&apos;s pet roster without an account.
      </p>
      {isLoading ? (
        <Spinner />
      ) : tokens.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground">No links issued yet.</p>
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <span
                className={`h-2 w-2 flex-shrink-0 rounded-full ${t.isActive ? "bg-success" : "bg-muted-foreground/50"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[12px] text-foreground">/emergency/{t.token.slice(0, 12)}…</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {t.isActive ? "Active · " : t.revoked ? "Revoked · " : "Expired · "}
                  expires {new Date(t.expiresAt).toLocaleString()}
                </p>
              </div>
              {t.isActive && (
                <>
                  <button
                    onClick={() => copy(t.token)}
                    className="flex items-center rounded-lg bg-muted p-2 text-muted-foreground"
                    title="Copy link"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => revoke(t.id)}
                    className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[12px] font-semibold text-destructive"
                  >
                    <Ban className="h-3.5 w-3.5" /> Revoke
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
