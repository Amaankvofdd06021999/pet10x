"use client"

import { useState } from "react"
import { ShieldCheck, ShieldOff, Send, Syringe, Plus, Lock } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import { capabilities } from "@/lib/data/clinic/context"
import { useBusinessType, FALLBACK_TYPE } from "@/lib/data/business-types"
import { useClinicPatient, useSharedRecord, updatePatient, requestPetDetails } from "@/lib/data/clinic/customers"
import {
  usePatientVisits, usePatientVaccinations, recordVaccination,
  publishRecord, createVisit, updateVisit, addVisitService,
} from "@/lib/data/clinic/visits"
import { usePatientAppointments } from "@/lib/data/clinic/schedule"
import { formatDateShort, ageFrom, dueLabel, formatMoney } from "@/lib/data/clinic/time"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Field, Modal,
  TextInput, TextArea, SpeciesIcon, LinkedBadge, SegmentedTabs, Toolbar,
} from "@/components/screens/shared/ui"

type Tab = "overview" | "visits" | "vaccines" | "shared"

export function PatientPanel({
  patientId,
  clinic,
  staffId,
}: {
  patientId: string
  clinic: ClinicMembership
  staffId: string | null
}) {
  const patient = useClinicPatient(patientId)
  const visits = usePatientVisits(patientId)
  const vaccines = usePatientVaccinations(patientId)
  const appts = usePatientAppointments(patientId)
  const [tab, setTab] = useState<Tab>("overview")
  const caps = capabilities(clinic.role, clinic.tier, clinic.isOwner)
  const type = useBusinessType(clinic.kind).data ?? FALLBACK_TYPE
  // A groomer has no business holding a vaccination record, and a walker has no
  // business being offered a "Shared by owner" tab it can never fill.
  const hasMedical = type.modules.includes("medical")
  const hasSharing = type.modules.includes("records_sharing")

  if (patient.isLoading) return <Spinner label="Opening the chart" />
  if (patient.error) return <LoadError message={patient.error} onRetry={patient.refetch} />
  const p = patient.data
  if (!p) return <EmptyState title="Patient not found" />

  return (
    <div className="flex flex-col gap-4">
      {/* Signalment header. The allergy banner never collapses. */}
      <div className="rounded-2xl border border-border bg-secondary/50 p-4">
        <p className="flex flex-wrap items-center gap-2 text-[17px] font-semibold text-foreground">
          <SpeciesIcon species={p.species} />
          {p.name}
          <LinkedBadge linked={p.isLinked} />
          {p.isDeceased && <Pill tone="neutral">Deceased</Pill>}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {[p.breed, p.sex, ageFrom(p.dob), p.colour].filter(Boolean).join(" · ")}
          {p.microchip ? ` · chip ${p.microchip}` : ""}
        </p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {p.customerName}
          {p.customerPhone ? ` · ${p.customerPhone}` : ""}
        </p>
        {(p.allergies || p.behaviouralAlert) && (
          <div className="mt-2 flex flex-col gap-1">
            {p.allergies && (
              <p className="rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[12.5px] font-semibold text-destructive">
                Allergies: {p.allergies}
              </p>
            )}
            {p.behaviouralAlert && (
              <p className="rounded-lg bg-warning/10 px-2.5 py-1.5 text-[12.5px] font-semibold text-warning-strong">
                Handling: {p.behaviouralAlert}
              </p>
            )}
          </div>
        )}
      </div>

      <SegmentedTabs
        label="Patient sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "visits", label: type.modules.includes("grooming") ? "Appointments" : "Visits", count: visits.data.length },
          ...(hasMedical ? [{ id: "vaccines" as const, label: "Vaccines", count: vaccines.data.length }] : []),
          ...(hasSharing ? [{ id: "shared" as const, label: "Shared by owner" }] : []),
        ]}
      />

      {tab === "overview" && (
        <OverviewTab patient={p} onSaved={patient.refetch} appts={appts.data.length} canEdit={caps.recordVisits} />
      )}

      {tab === "visits" && (
        <VisitsTab
          patientId={patientId}
          clinic={clinic}
          staffId={staffId}
          customerId={p.customerId}
          isLinked={p.isLinked}
          visits={visits}
          caps={caps}
        />
      )}

      {tab === "vaccines" && hasMedical && (
        <VaccinesTab
          patientId={patientId}
          clinic={clinic}
          staffId={staffId}
          isLinked={p.isLinked}
          vaccines={vaccines}
          caps={caps}
        />
      )}

      {tab === "shared" && hasSharing && (
        <SharedTab patientId={patientId} isLinked={p.isLinked} caps={caps} petName={p.name} />
      )}
    </div>
  )
}

function OverviewTab({
  patient, onSaved, appts, canEdit,
}: {
  patient: NonNullable<ReturnType<typeof useClinicPatient>["data"]>
  onSaved: () => void
  appts: number
  canEdit: boolean
}) {
  const [f, setF] = useState({
    allergies: patient.allergies ?? "",
    conditions: patient.conditions ?? "",
    medicationsNotes: patient.medicationsNotes ?? "",
    behaviouralAlert: patient.behaviouralAlert ?? "",
    notes: patient.notes ?? "",
    weightKg: patient.weightGrams ? String(patient.weightGrams / 1000) : "",
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <SectionCard title="Practice notes" subtitle={`${appts} appointment${appts === 1 ? "" : "s"} on file`}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Allergies">
            {(p) => <TextInput {...p} disabled={!canEdit} value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} />}
          </Field>
          <Field label="Weight (kg)">
            {(p) => (
              <TextInput
                {...p}
                disabled={!canEdit}
                inputMode="decimal"
                value={f.weightKg}
                onChange={(e) => setF({ ...f, weightKg: e.target.value })}
              />
            )}
          </Field>
        </div>
        <Field label="Ongoing conditions">
          {(p) => <TextArea {...p} disabled={!canEdit} value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} />}
        </Field>
        <Field label="Medication notes">
          {(p) => <TextArea {...p} disabled={!canEdit} value={f.medicationsNotes} onChange={(e) => setF({ ...f, medicationsNotes: e.target.value })} />}
        </Field>
        <Field label="Handling note" hint="Shown on every appointment card for this animal.">
          {(p) => <TextInput {...p} disabled={!canEdit} value={f.behaviouralAlert} onChange={(e) => setF({ ...f, behaviouralAlert: e.target.value })} />}
        </Field>
        <Field label="Internal note" hint="Stays with the practice. Never handed back to the owner." error={error}>
          {(p) => <TextArea {...p} disabled={!canEdit} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />}
        </Field>
        {canEdit && (
          <div>
            <Button
              busy={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                const kg = Number.parseFloat(f.weightKg)
                const res = await updatePatient(patient.id, {
                  allergies: f.allergies || null,
                  conditions: f.conditions || null,
                  medications_notes: f.medicationsNotes || null,
                  behavioural_alert: f.behaviouralAlert || null,
                  notes: f.notes || null,
                  weight_grams: Number.isFinite(kg) && kg > 0 ? Math.round(kg * 1000) : null,
                })
                setBusy(false)
                if (res.error) setError(res.error)
                else onSaved()
              }}
            >
              Save
            </Button>
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function VisitsTab({
  patientId, clinic, staffId, customerId, isLinked, visits, caps,
}: {
  patientId: string
  clinic: ClinicMembership
  staffId: string | null
  customerId: string
  isLinked: boolean
  visits: ReturnType<typeof usePatientVisits>
  caps: ReturnType<typeof capabilities>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ id: string; summary: string; nextDue: string; reason: string } | null>(null)

  async function startVisit() {
    setBusy("new")
    const res = await createVisit({
      businessId: clinic.businessId,
      patientId,
      customerId,
      staffId,
      reason: "Consultation",
    })
    setBusy(null)
    if (res.error) window.alert(res.error)
    else visits.refetch()
  }

  return (
    <SectionCard
      title="Visits"
      subtitle="What the practice did, and what it charged"
      actions={caps.recordVisits && <Button size="sm" onClick={() => void startVisit()} busy={busy === "new"}><Plus className="h-4 w-4" aria-hidden="true" /> Record a visit</Button>}
    >
      {visits.isLoading ? (
        <Spinner />
      ) : visits.data.length === 0 ? (
        <EmptyState title="No visits recorded" detail="Recording a visit is what makes reminders and invoices possible." />
      ) : (
        <ul className="flex flex-col gap-2">
          {visits.data.map((v) => (
            <li key={v.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-foreground">
                    {v.reason ?? "Visit"} · {formatDateShort(v.visitedOn)}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {v.staffName}
                    {v.totalCents > 0 ? ` · ${formatMoney(v.totalCents)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {v.publishedAt ? (
                    <Pill tone="good" title={`Handed back ${formatDateShort(v.publishedAt)}`}>
                      Shared with owner
                    </Pill>
                  ) : (
                    caps.publishRecords &&
                    isLinked && (
                      <Button
                        size="sm"
                        variant="secondary"
                        busy={busy === v.id}
                        onClick={async () => {
                          setBusy(v.id)
                          const res = await publishRecord(patientId, "visit_summary", v.id)
                          setBusy(null)
                          if (res.error) window.alert(res.error)
                          else visits.refetch()
                        }}
                      >
                        <Send className="h-3.5 w-3.5" aria-hidden="true" /> Hand back
                      </Button>
                    )
                  )}
                  {caps.recordVisits && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          id: v.id,
                          summary: v.summary ?? "",
                          nextDue: v.nextDueOn ?? "",
                          reason: v.nextDueReason ?? "",
                        })
                      }
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </div>
              {v.summary && <p className="mt-2 text-[12.5px] text-muted-foreground">{v.summary}</p>}
              {v.services.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {v.services.map((s) => (
                    <li key={s.id}>
                      <Pill tone="neutral">
                        {s.name} · {formatMoney(s.unitPriceCents)}
                      </Pill>
                    </li>
                  ))}
                </ul>
              )}
              {v.nextDueOn && (
                <p className="mt-2 text-[12px] font-medium text-info">
                  Next due: {v.nextDueReason ?? "follow-up"} — {formatDateShort(v.nextDueOn)}
                </p>
              )}

              {draft?.id === v.id && (
                <div className="mt-3 flex flex-col gap-2 rounded-xl bg-secondary p-3">
                  <Field label="Summary for the owner" hint="This is what gets handed back if you publish it.">
                    {(p) => <TextArea {...p} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />}
                  </Field>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Next due">
                      {(p) => <TextInput {...p} type="date" value={draft.nextDue} onChange={(e) => setDraft({ ...draft, nextDue: e.target.value })} />}
                    </Field>
                    <Field label="What for">
                      {(p) => <TextInput {...p} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="Dental check" />}
                    </Field>
                  </div>
                  <Toolbar>
                    <Button
                      size="sm"
                      onClick={async () => {
                        const res = await updateVisit(v.id, {
                          summary: draft.summary || null,
                          next_due_on: draft.nextDue || null,
                          next_due_reason: draft.reason || null,
                        })
                        if (res.error) window.alert(res.error)
                        else {
                          setDraft(null)
                          visits.refetch()
                        }
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const name = window.prompt("Service name")
                        if (!name) return
                        const price = window.prompt("Price in dollars", "0")
                        const cents = Math.round(Number.parseFloat(price ?? "0") * 100)
                        const res = await addVisitService(v.id, clinic.businessId, name, Number.isFinite(cents) ? cents : 0)
                        if (res.error) window.alert(res.error)
                        else visits.refetch()
                      }}
                    >
                      Add service
                    </Button>
                  </Toolbar>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function VaccinesTab({
  patientId, clinic, staffId, isLinked, vaccines, caps,
}: {
  patientId: string
  clinic: ClinicMembership
  staffId: string | null
  isLinked: boolean
  vaccines: ReturnType<typeof usePatientVaccinations>
  caps: ReturnType<typeof capabilities>
}) {
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: "Rabies", product: "", given: new Date().toISOString().slice(0, 10), expires: "" })
  const [busy, setBusy] = useState<string | null>(null)

  return (
    <SectionCard
      title="Vaccinations given here"
      subtitle="Publishing one puts a confirmed record in the owner's app"
      actions={caps.recordVisits && <Button size="sm" onClick={() => setAdding((v) => !v)}><Syringe className="h-4 w-4" aria-hidden="true" /> Record</Button>}
    >
      {adding && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl bg-secondary p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Vaccine" required>
              {(p) => <TextInput {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
            </Field>
            <Field label="Product">
              {(p) => <TextInput {...p} value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} placeholder="Nobivac 3-Rabies" />}
            </Field>
            <Field label="Given on" required>
              {(p) => <TextInput {...p} type="date" value={f.given} onChange={(e) => setF({ ...f, given: e.target.value })} />}
            </Field>
            <Field label="Due again">
              {(p) => <TextInput {...p} type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} />}
            </Field>
          </div>
          <Toolbar>
            <Button
              size="sm"
              busy={busy === "add"}
              onClick={async () => {
                setBusy("add")
                const res = await recordVaccination({
                  businessId: clinic.businessId,
                  patientId,
                  staffId,
                  name: f.name,
                  product: f.product,
                  givenOn: f.given,
                  expiresOn: f.expires || null,
                })
                setBusy(null)
                if (res.error) window.alert(res.error)
                else {
                  setAdding(false)
                  vaccines.refetch()
                }
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </Toolbar>
        </div>
      )}

      {vaccines.isLoading ? (
        <Spinner />
      ) : vaccines.data.length === 0 ? (
        <EmptyState title="No vaccinations recorded here" />
      ) : (
        <ul className="flex flex-col gap-2">
          {vaccines.data.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground">{v.name}</p>
                <p className="text-[12px] text-muted-foreground">
                  Given {formatDateShort(v.givenOn)}
                  {v.expiresOn ? ` · ${dueLabel(v.expiresOn)}` : ""}
                  {v.product ? ` · ${v.product}` : ""}
                </p>
              </div>
              {v.publishedAt ? (
                <Pill tone="good">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" /> In owner&apos;s app
                </Pill>
              ) : caps.publishRecords && isLinked ? (
                <Button
                  size="sm"
                  variant="secondary"
                  busy={busy === v.id}
                  onClick={async () => {
                    setBusy(v.id)
                    const res = await publishRecord(patientId, "vaccination", v.id)
                    setBusy(null)
                    if (res.error) window.alert(res.error)
                    else vaccines.refetch()
                  }}
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" /> Hand back
                </Button>
              ) : (
                <Pill tone="neutral" title={isLinked ? "Your role or tier does not allow publishing" : "Not linked to a Pet10x account"}>
                  Local only
                </Pill>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function SharedTab({
  patientId, isLinked, caps, petName,
}: {
  patientId: string
  isLinked: boolean
  caps: ReturnType<typeof capabilities>
  petName: string
}) {
  const shared = useSharedRecord(patientId)

  if (!isLinked) {
    return (
      <EmptyState
        title="Not linked to a Pet10x account"
        detail={`Ask the owner to confirm ${petName} is theirs. Linking shares nothing on its own — they choose what you see afterwards.`}
        icon={<Lock className="h-5 w-5" aria-hidden="true" />}
        action={caps.readSharedRecords ? <RequestDetailsButton patientId={patientId} label="Ask the owner to link" /> : undefined}
      />
    )
  }
  if (!caps.readSharedRecords) {
    return (
      <EmptyState
        title="Your role cannot read shared records"
        detail="Reading an owner's records is a clinical need-to-know. Ask a veterinarian or nurse."
        icon={<ShieldOff className="h-5 w-5" aria-hidden="true" />}
      />
    )
  }
  if (shared.isLoading) return <Spinner label="Checking what the owner shared" />
  if (shared.error) return <LoadError message={shared.error} onRetry={shared.refetch} />
  const s = shared.data
  if (!s || !s.shared) {
    return (
      <EmptyState
        title="Nothing shared yet"
        detail={`Request what you need before ${petName} arrives, or take a desk code at reception.`}
        icon={<ShieldOff className="h-5 w-5" aria-hidden="true" />}
        action={<RequestDetailsButton patientId={patientId} label="Request pet details" />}
      />
    )
  }

  const health = s.data.health ?? {}
  const vax = s.data.vaccinations ?? []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-accent/10 p-3">
        <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
        <p className="text-[12.5px] text-foreground">
          Shared by the owner. This read has been logged.
          {s.expiresAt ? ` Access ends ${formatDateShort(s.expiresAt)}.` : " No end date set."}
        </p>
      </div>

      {s.scopes.includes("health_notes") && (
        <SectionCard title="Health notes" subtitle="Recorded by the owner">
          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              ["Allergies", health.allergies],
              ["Conditions", health.conditions],
              ["Medications", health.medications_notes],
              ["Behaviour", health.behavioral_notes],
              ["Usual vet", health.vet_clinic],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="text-[13px] text-foreground">{v ? String(v) : "—"}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      )}

      {s.scopes.includes("vaccinations") && (
        <SectionCard title="Vaccination history" subtitle="From the owner's own record">
          {vax.length === 0 ? (
            <EmptyState title="None recorded" />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {vax.map((v, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="text-[13px] font-medium text-foreground">{String(v.name)}</span>
                  <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    {v.expires_on ? dueLabel(String(v.expires_on)) : "No expiry"}
                    <Pill tone={v.provenance === "clinic_confirmed" ? "good" : "neutral"}>
                      {v.provenance === "clinic_confirmed" ? "Vet confirmed" : "Owner reported"}
                    </Pill>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {s.scopes.includes("other_clinic_records") && (s.data.other_clinic_records ?? []).length > 0 && (
        <SectionCard title="Records from other practices">
          <ul className="flex flex-col gap-1.5">
            {(s.data.other_clinic_records ?? []).map((r, i) => (
              <li key={i} className="rounded-lg border border-border px-3 py-2">
                <p className="text-[13px] font-medium text-foreground">{String(r.title)}</p>
                <p className="text-[12px] text-muted-foreground">
                  {String(r.business)} · {formatDateShort(String(r.published_at))}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}

/**
 * "Request pet details" — the action that was missing.
 *
 * The practice picks what it needs; the owner still decides. Nothing here tells
 * the practice whether an email belongs to a Pet10x account, so this cannot be
 * used to probe for one.
 */
function RequestDetailsButton({ patientId, label }: { patientId: string; label: string }) {
  const [open, setOpen] = useState(false)
  const [scopes, setScopes] = useState<string[]>(["identity", "vaccinations", "health_notes"])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const SCOPES: Array<{ key: string; label: string; detail: string; sensitive?: boolean }> = [
    { key: "identity", label: "Basic details", detail: "Breed, age, sex, microchip, weight" },
    { key: "vaccinations", label: "Vaccinations", detail: "What is current and what has lapsed" },
    { key: "health_notes", label: "Health notes", detail: "Allergies, conditions, medications" },
    { key: "documents", label: "Documents", detail: "Paperwork the owner uploaded" },
    { key: "other_clinic_records", label: "Other practices' records", detail: "For a referral", sensitive: true },
  ]

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Send className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          setSent(null)
          setError(null)
        }}
        title="Request pet details"
        description="The owner decides what to share. They can stop it at any time."
        footer={
          sent ? (
            <Button variant="secondary" onClick={() => { setOpen(false); setSent(null) }}>Close</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                busy={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  const res = await requestPetDetails(patientId, scopes, message)
                  setBusy(false)
                  if (res.error) setError(res.error)
                  else if (res.alreadyPending) setSent("A request is already waiting with the owner.")
                  else if (res.kind === "link")
                    setSent(
                      res.delivered
                        ? "Asked the owner to confirm this pet is theirs."
                        : "Recorded. If this customer joins Pet10x with that address, they will be asked.",
                    )
                  else setSent("Sent. It is waiting in the owner's app.")
                }}
              >
                Send request
              </Button>
            </>
          )
        }
      >
        {sent ? (
          <p className="rounded-xl bg-success/10 p-3 text-[13px] font-medium text-success">{sent}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <fieldset className="rounded-xl border border-border p-3">
              <legend className="px-1 text-[12px] font-semibold text-foreground">What are you asking for?</legend>
              <div className="flex flex-col gap-2">
                {SCOPES.map((sc) => (
                  <label key={sc.key} className="flex items-start gap-2 text-[12.5px]">
                    <input
                      type="checkbox"
                      checked={scopes.includes(sc.key)}
                      onChange={(e) =>
                        setScopes((prev) => (e.target.checked ? [...prev, sc.key] : prev.filter((x) => x !== sc.key)))
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold text-foreground">{sc.label}</span>
                      {sc.sensitive && <span className="ml-1 text-warning-strong">(sensitive)</span>}
                      <span className="block text-muted-foreground">{sc.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Why" hint="Shown to the owner. A reason gets a faster yes.">
              {(p) => (
                <TextArea
                  {...p}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Coming in this afternoon — we would like the vaccination history first."
                />
              )}
            </Field>
            {error && <p className="text-[12.5px] font-medium text-destructive">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  )
}
