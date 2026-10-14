"use client"

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import {
  ArrowLeft, ShieldCheck, ShieldOff, KeyRound, Stethoscope, Check, X,
  CalendarPlus, Copy, Receipt, ChevronDown,
} from "lucide-react"
import { usePets } from "@/lib/data"
import {
  useMyVetShares, useVetDirectory, usePendingLinkRequests, usePendingShareRequests,
  useClinicRecords, useMyVetAppointments, useMyInvoices, grantShare, revokeShare, createDeskCode,
  decideLinkRequest, decideShareRequest, bookVetAppointment, approveEstimate,
  ownerCancelAppointment, ownerDeclineEstimate,
  SCOPE_LABELS, DEFAULT_SCOPES,
  type VetShare, type OwnerAppointment,
} from "@/lib/data/owner-vets"
import { appointmentLabel, appointmentTone, canOwnerCancel } from "@/lib/data/appointment-labels"
import type { Slot } from "@/lib/data/clinic/schedule"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  groupBills, billLabel, billStatusLabel, billStatusTone, isUnpaid, lineTotalCents,
  type OwnerBill,
} from "@/lib/data/owner-bills"
import { MY_VETS_TABS, type MyVetsTab } from "@/lib/navigation"
import { useAppointmentTypes, useAvailableSlots } from "@/lib/data/clinic/schedule"
import { formatDateShort, formatTime, formatMoney, todayISO, addDaysISO } from "@/lib/data/clinic/time"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Modal,
  Field, Select, TextInput, SegmentedTabs, Toolbar,
} from "@/components/screens/shared/ui"

type View = MyVetsTab

/**
 * "Who can see my dog's records?" answered in three seconds, and undone in one
 * tap. Everything a practice can see is a row with a scope list and an expiry.
 *
 * `initialTab` is how a `my-vets:bills` notification lands on Bills
 * (`lib/navigation.ts`); anything else opens on Sharing.
 *
 * `practiceId` is a vet's page in Services asking to book there ("Book an
 * appointment"): the screen opens on Appointments with the booking picker
 * already on that practice.
 */
export function MyVetsScreen({
  onBack,
  initialTab,
  practiceId,
}: {
  onBack?: () => void
  initialTab?: string
  practiceId?: string
}) {
  const [view, setView] = useState<View>(
    MY_VETS_TABS.includes(initialTab as View) ? (initialTab as View) : practiceId ? "visits" : "sharing",
  )
  const pets = usePets()
  const shares = useMyVetShares()
  const links = usePendingLinkRequests()
  const shareReqs = usePendingShareRequests()
  const records = useClinicRecords()
  const appts = useMyVetAppointments()
  const bills = useMyInvoices()
  const [shareOpen, setShareOpen] = useState(false)
  const [codeFor, setCodeFor] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [bookOpen, setBookOpen] = useState(() => Boolean(practiceId))
  /* A failed decision or code, in words on the page — never a browser alert. */
  const [notice, setNotice] = useState<string | null>(null)
  const [stopping, setStopping] = useState<VetShare | null>(null)
  const [cancelling, setCancelling] = useState<OwnerAppointment | null>(null)
  /* The clock the Cancel button is judged against, read once per visit to the
     screen. owner_cancel_appointment is the authority: a visit that crosses
     the 2-hour line while the screen is open gets its "call the practice"
     sentence in the dialog. */
  const [now] = useState(() => new Date())
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const pending = links.data.length + shareReqs.data.length

  async function stopSharing(s: VetShare): Promise<{ error: string | null }> {
    const res = await revokeShare(s.shareId)
    if (res.error) return { error: res.error }
    toast.success(`${s.businessName} can no longer see anything new about ${s.petName}`)
    shares.refetch()
    return { error: null }
  }

  async function cancelVisit(a: OwnerAppointment, reason: string | null): Promise<{ error: string | null }> {
    const res = await ownerCancelAppointment(a.id, reason)
    if (res.error) return { error: res.error }
    toast.success("Visit cancelled. The practice has been told.")
    appts.refetch()
    return { error: null }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 px-4 pb-8 pt-4">
      <header className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <div>
          <h1 className="text-[22px] font-semibold text-foreground">My vets</h1>
          <p className="text-[13px] text-muted-foreground">
            What each practice can see, and how to stop it.
          </p>
        </div>
      </header>

      {notice && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="flex-shrink-0 text-destructive/80 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {pending > 0 && (
        <SectionCard title="Waiting on you" subtitle="A practice has asked for something">
          <ul className="flex flex-col gap-2">
            {links.data.map((r) => (
              <li key={r.id} className="rounded-xl border border-border p-3">
                <p className="text-[13.5px] font-semibold text-foreground">
                  {r.businessName} says they treat {r.patientName}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  Linking lets you see their records for your pet. It does not share anything yet.
                </p>
                <Toolbar>
                  <div className="mt-2 flex gap-2">
                    <PetPickerButton
                      pets={pets.data.map((p) => ({ id: p.id, name: p.name }))}
                      label="That's my pet"
                      onPick={async (petId) => {
                        setNotice(null)
                        const res = await decideLinkRequest(r.id, true, petId)
                        if (res.error) setNotice(res.error)
                        else {
                          links.refetch()
                          shares.refetch()
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const res = await decideLinkRequest(r.id, false)
                        if (res.error) setNotice(res.error)
                        else links.refetch()
                      }}
                    >
                      Not mine
                    </Button>
                  </div>
                </Toolbar>
              </li>
            ))}
            {shareReqs.data.map((r) => (
              <li key={r.id} className="rounded-xl border border-border p-3">
                <p className="text-[13.5px] font-semibold text-foreground">
                  {r.businessName} would like to see {r.petName}&apos;s records
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {r.scopes.map((s) => (
                    <li key={s}>
                      <Pill tone={SCOPE_LABELS[s]?.sensitive ? "warn" : "neutral"}>
                        {SCOPE_LABELS[s]?.label ?? s}
                      </Pill>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      const res = await decideShareRequest(r.id, true)
                      if (res.error) setNotice(res.error)
                      else {
                        shareReqs.refetch()
                        shares.refetch()
                      }
                    }}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> Allow
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const res = await decideShareRequest(r.id, false)
                      if (res.error) setNotice(res.error)
                      else shareReqs.refetch()
                    }}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> No
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <Toolbar>
        <SegmentedTabs
          label="Vet sections"
          active={view}
          onChange={setView}
          tabs={[
            { id: "sharing", label: "Sharing", count: shares.data.length },
            { id: "records", label: "Records", count: records.data.length },
            { id: "visits", label: "Appointments", count: appts.data.length },
            { id: "bills", label: "Bills", count: bills.data.length },
          ]}
        />
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setBookOpen(true)}>
            <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Book
          </Button>
          <Button size="sm" onClick={() => setShareOpen(true)}>
            Share with a vet
          </Button>
        </div>
      </Toolbar>

      {view === "sharing" && (
        <>
          {shares.isLoading ? (
            <Spinner />
          ) : shares.error ? (
            <LoadError message={shares.error} onRetry={shares.refetch} />
          ) : shares.data.length === 0 ? (
            <EmptyState
              title="No practice can see anything"
              detail="Share with your vet so they arrive at your appointment already knowing your pet's history."
              icon={<ShieldOff className="h-5 w-5" aria-hidden="true" />}
              action={<Button size="sm" onClick={() => setShareOpen(true)}>Share with a vet</Button>}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {shares.data.map((s) => (
                <li key={s.shareId} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground">
                        <Stethoscope className="h-4 w-4 text-primary" aria-hidden="true" />
                        {s.businessName}
                        <Pill tone="accent">{s.petName}</Pill>
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        Shared {formatDateShort(s.grantedAt)}
                        {s.expiresAt ? ` · access ends ${formatDateShort(s.expiresAt)}` : " · no end date"}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {s.scopes.map((sc) => (
                          <li key={sc}>
                            <Pill tone={SCOPE_LABELS[sc]?.sensitive ? "warn" : "good"}>
                              {SCOPE_LABELS[sc]?.label ?? sc}
                            </Pill>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setStopping(s)}>
                      Stop sharing
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <SectionCard title="At the desk" subtitle="Read a one-time code to reception">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="deskpet" className="sr-only">
                Pet
              </label>
              <Select id="deskpet" value={codeFor ?? ""} onChange={(e) => setCodeFor(e.target.value || null)} className="w-auto">
                <option value="">Choose a pet…</option>
                {pets.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                disabled={!codeFor}
                onClick={async () => {
                  if (!codeFor) return
                  const res = await createDeskCode(codeFor)
                  if (res.error) setNotice(res.error)
                  else setCode(res.code ?? null)
                }}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" /> Get a code
              </Button>
              {code && (
                <span className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2">
                  <span className="font-mono text-[18px] font-semibold tracking-[0.25em] text-foreground">{code}</span>
                  <button
                    type="button"
                    aria-label="Copy code"
                    onClick={() => void navigator.clipboard?.writeText(code)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              )}
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Single use, valid for ten minutes, and only a verified practice can redeem it.
            </p>
          </SectionCard>
        </>
      )}

      {view === "records" &&
        (records.isLoading ? (
          <Spinner />
        ) : records.data.length === 0 ? (
          <EmptyState
            title="No records from a practice yet"
            detail="When your vet hands a record back, it appears here carrying their name."
            icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {records.data.map((r) => (
              <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-foreground">
                  {r.title}
                  <Pill tone="good">
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Vet confirmed
                  </Pill>
                </p>
                {r.summary && <p className="mt-1 text-[12.5px] text-muted-foreground">{r.summary}</p>}
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {r.petName} · {r.businessName} · {formatDateShort(r.publishedAt)}
                </p>
              </li>
            ))}
          </ul>
        ))}

      {view === "visits" &&
        (appts.isLoading ? (
          <Spinner />
        ) : appts.data.length === 0 ? (
          <EmptyState
            title="No appointments"
            detail="Book a visit at any practice on Pet10x. It shows here once you send the request."
            action={
              <Button size="sm" onClick={() => setBookOpen(true)}>
                <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Book
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {appts.data.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-foreground">
                    {a.petName} · {a.reason ?? "Appointment"}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {a.businessName} · {formatDateShort(a.startsAt)} at {formatTime(a.startsAt, tz)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={appointmentTone(a.status)}>{appointmentLabel(a.status)}</Pill>
                  {canOwnerCancel(a.status, a.startsAt, now) && (
                    <Button size="sm" variant="secondary" onClick={() => setCancelling(a)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ))}

      {view === "bills" && <BillsView bills={bills} />}

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        pets={pets.data.map((p) => ({ id: p.id, name: p.name }))}
        onShared={() => {
          setShareOpen(false)
          shares.refetch()
        }}
      />

      <BookVetModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        pets={pets.data.map((p) => ({ id: p.id, name: p.name }))}
        initialPracticeId={practiceId}
        onBooked={() => {
          setBookOpen(false)
          setView("visits")
          appts.refetch()
          shares.refetch()
        }}
      />

      <ConfirmDialog
        open={stopping !== null}
        onOpenChange={(open) => !open && setStopping(null)}
        title={stopping ? `Stop ${stopping.businessName} seeing anything new about ${stopping.petName}?` : "Stop sharing?"}
        description="This does not remove the appointment history and notes they keep in their own system."
        confirmLabel="Stop sharing"
        cancelLabel="Keep sharing"
        tone="danger"
        onConfirm={() => (stopping ? stopSharing(stopping) : Promise.resolve({ error: null }))}
      />

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel this visit?"
        description={
          cancelling
            ? `${cancelling.petName} at ${cancelling.businessName}, ${formatDateShort(cancelling.startsAt)} at ${formatTime(cancelling.startsAt, tz)}. The practice is told.`
            : ""
        }
        confirmLabel="Cancel visit"
        cancelLabel="Keep visit"
        tone="danger"
        reason={{ label: "Reason (optional, the practice sees this)", required: false, placeholder: "Something came up at work" }}
        onConfirm={(why) => (cancelling ? cancelVisit(cancelling, why) : Promise.resolve({ error: null }))}
      />
    </div>
  )
}

/**
 * Estimates waiting on the owner first, then every other bill. Pet10x takes no
 * payment, so there is no pay button: an unpaid invoice says where to pay.
 *
 * An estimate waiting on the owner opens with its lines showing — the owner is
 * being asked to agree to them — and can be approved or declined. Declining
 * needs a note: the practice reads it to know what to change.
 */
function BillsView({ bills }: { bills: ReturnType<typeof useMyInvoices> }) {
  const [approving, setApproving] = useState<OwnerBill | null>(null)
  const [declining, setDeclining] = useState<OwnerBill | null>(null)

  if (bills.isLoading) return <Spinner label="Loading bills" />
  if (bills.error) return <LoadError message={bills.error} onRetry={bills.refetch} />
  if (bills.data.length === 0) {
    return (
      <EmptyState
        title="No bills from a practice"
        detail="Estimates and invoices your vet sends through Pet10x appear here."
        icon={<Receipt className="h-5 w-5" aria-hidden="true" />}
      />
    )
  }

  const { awaiting, others } = groupBills(bills.data)

  /* Both dialogs keep a failure on screen, so only success toasts. */
  async function approve(b: OwnerBill): Promise<{ error: string | null }> {
    const res = await approveEstimate(b.id)
    if (res.error) return { error: res.error }
    toast.success("Estimate approved. The practice has been told.")
    bills.refetch()
    return { error: null }
  }

  async function decline(b: OwnerBill, note: string | null): Promise<{ error: string | null }> {
    const res = await ownerDeclineEstimate(b.id, note ?? "")
    if (res.error) return { error: res.error }
    toast.success("Estimate declined. The practice has your note.")
    bills.refetch()
    return { error: null }
  }

  return (
    <div className="flex flex-col gap-4">
      {awaiting.length > 0 && (
        <SectionCard title="Estimates to approve" subtitle="Your practice is waiting for your go-ahead">
          <ul className="flex flex-col gap-2">
            {awaiting.map((b) => (
              <BillRow
                key={b.id}
                bill={b}
                defaultOpen
                action={
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setDeclining(b)}>
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> Decline
                    </Button>
                    <Button size="sm" onClick={() => setApproving(b)}>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Approve estimate
                    </Button>
                  </>
                }
              />
            ))}
          </ul>
        </SectionCard>
      )}
      {others.length > 0 && (
        <ul className="flex flex-col gap-2">
          {others.map((b) => (
            <BillRow key={b.id} bill={b} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(open) => !open && setApproving(null)}
        title={
          approving
            ? `Approve ${billLabel(approving).toLowerCase()} for ${formatMoney(approving.totalCents, approving.currency)}?`
            : "Approve this estimate?"
        }
        description={
          approving
            ? `From ${approving.businessName} for ${approving.petName}. The practice is told you agreed to this cost.`
            : ""
        }
        confirmLabel="Approve estimate"
        cancelLabel="Not yet"
        onConfirm={() => (approving ? approve(approving) : Promise.resolve({ error: null }))}
      />

      <ConfirmDialog
        open={declining !== null}
        onOpenChange={(open) => !open && setDeclining(null)}
        title={declining ? `Decline ${billLabel(declining).toLowerCase()}?` : "Decline this estimate?"}
        description={
          declining
            ? `${declining.businessName} is told you said no to ${formatMoney(declining.totalCents, declining.currency)} for ${declining.petName}, with your note.`
            : ""
        }
        confirmLabel="Decline estimate"
        cancelLabel="Keep it open"
        tone="danger"
        reason={{
          label: "Note for the practice",
          required: true,
          placeholder: "I'd like to talk through a cheaper option first",
          requiredMessage: "Add a note — the practice will see it.",
        }}
        onConfirm={(note) => (declining ? decline(declining, note) : Promise.resolve({ error: null }))}
      />
    </div>
  )
}

function BillRow({
  bill: b,
  action,
  defaultOpen = false,
}: {
  bill: OwnerBill
  action?: ReactNode
  /** Lines showing from the start — an estimate the owner is asked to agree to. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const linesId = `bill-lines-${b.id}`
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-foreground">
            {billLabel(b)}
            <Pill tone={billStatusTone(b.status)}>{billStatusLabel(b.status)}</Pill>
            <Pill tone="accent">{b.petName}</Pill>
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {b.businessName} · {formatDateShort(b.issuedOn ?? b.createdAt)}
            {b.ownerApprovedAt ? ` · you approved ${formatDateShort(b.ownerApprovedAt)}` : ""}
          </p>
          {isUnpaid(b) && (
            <p className="mt-1 text-[12px] font-medium text-foreground">Pay the clinic directly.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold tabular-nums text-foreground">
            {formatMoney(b.totalCents, b.currency)}
          </span>
          {action}
        </div>
      </div>
      {b.lines.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={linesId}
            onClick={() => setOpen((v) => !v)}
            className="mt-2 flex items-center gap-1 text-[12px] font-semibold text-primary"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            {open ? "Hide" : "Show"} {b.lines.length} item{b.lines.length === 1 ? "" : "s"}
          </button>
          {open && (
            <ul id={linesId} className="mt-2 flex flex-col divide-y divide-border rounded-xl border border-border">
              {b.lines.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
                  <span className="min-w-0 text-foreground">
                    {l.description}
                    {l.quantity !== 1 && (
                      <span className="text-muted-foreground">
                        {" "}
                        × {l.quantity} at {formatMoney(l.unitPriceCents, b.currency)}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-foreground">
                    {formatMoney(lineTotalCents(l), b.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  )
}

function PetPickerButton({
  pets, label, onPick,
}: {
  pets: Array<{ id: string; name: string }>
  label: string
  onPick: (petId: string) => void | Promise<void>
}) {
  const [pick, setPick] = useState("")
  return (
    <span className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor={`pp-${label}`}>
        Which pet
      </label>
      <Select id={`pp-${label}`} value={pick} onChange={(e) => setPick(e.target.value)} className="w-auto">
        <option value="">Which pet?</option>
        {pets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Button size="sm" disabled={!pick} onClick={() => void onPick(pick)}>
        {label}
      </Button>
    </span>
  )
}

function ShareModal({
  open, onClose, pets, onShared,
}: {
  open: boolean
  onClose: () => void
  pets: Array<{ id: string; name: string }>
  onShared: () => void
}) {
  const [search, setSearch] = useState("")
  const dir = useVetDirectory(search)
  const [petId, setPetId] = useState("")
  const [bizId, setBizId] = useState("")
  const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share with a vet"
      description="Pick exactly what they may see. You can stop it at any time."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            busy={busy}
            onClick={async () => {
              setError(null)
              if (!petId || !bizId) {
                setError("Choose a pet and a practice.")
                return
              }
              setBusy(true)
              const res = await grantShare(petId, bizId, scopes)
              setBusy(false)
              if (res.error) setError(res.error)
              else onShared()
            }}
          >
            Share
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Pet" required>
          {(p) => (
            <Select {...p} value={petId} onChange={(e) => setPetId(e.target.value)}>
              <option value="">Choose…</option>
              {pets.map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Find a practice">
          {(p) => <TextInput {...p} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or city" />}
        </Field>
        <Field label="Practice" required error={error}>
          {(p) => (
            <Select {...p} value={bizId} onChange={(e) => setBizId(e.target.value)}>
              <option value="">Choose…</option>
              {dir.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.city ? ` — ${b.city}` : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <fieldset className="rounded-xl border border-border p-3">
          <legend className="px-1 text-[12px] font-semibold text-foreground">What they may see</legend>
          <div className="flex flex-col gap-2">
            {Object.entries(SCOPE_LABELS).map(([key, meta]) => (
              <label key={key} className="flex items-start gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={scopes.includes(key)}
                  onChange={(e) =>
                    setScopes((prev) => (e.target.checked ? [...prev, key] : prev.filter((s) => s !== key)))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold text-foreground">{meta.label}</span>
                  {meta.sensitive && <span className="ml-1 text-warning-strong">(sensitive)</span>}
                  <span className="block text-muted-foreground">{meta.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="rounded-xl bg-secondary p-3 text-[11.5px] text-muted-foreground">
          Stopping a share prevents anything new being seen. It does not remove the appointment history
          and notes the practice keeps in its own system — by law, they keep those.
        </p>
      </div>
    </Modal>
  )
}

type BookStep =
  | { kind: "pick" }
  | { kind: "review"; slot: Slot }
  | { kind: "done"; status: string | undefined; startsAt: string }

/**
 * Book a vet visit in two clear steps, so a tap never books by accident:
 * choose a time, then read a summary and press "Request appointment". Nothing
 * is sent until then.
 *
 * Sharing the basics is OFF until the owner ticks it (CU-8): booking a visit
 * is not consent to hand over records.
 *
 * `initialPracticeId` comes from a vet's page ("Book an appointment").
 */
function BookVetModal({
  open, onClose, pets, onBooked, initialPracticeId,
}: {
  open: boolean
  onClose: () => void
  pets: Array<{ id: string; name: string }>
  onBooked: () => void
  initialPracticeId?: string
}) {
  const dir = useVetDirectory("", initialPracticeId)
  const [bizId, setBizId] = useState(initialPracticeId ?? "")
  const [petId, setPetId] = useState("")
  const [typeId, setTypeId] = useState("")
  const [date, setDate] = useState(() => addDaysISO(todayISO(), 1))
  const [share, setShare] = useState(false)
  const [step, setStep] = useState<BookStep>({ kind: "pick" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const types = useAppointmentTypes(bizId || null)
  const bookable = types.data.filter((t) => t.isOnlineBookable && t.isActive)
  const slots = useAvailableSlots(bizId || null, typeId || null, date)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const practice = dir.data.find((b) => b.id === bizId)
  const practiceName = practice?.name ?? "The practice"
  const type = bookable.find((t) => t.id === typeId)
  const petName = pets.find((p) => p.id === petId)?.name ?? "Your pet"

  /* Closing from the success state is the same as "Done": the list refreshes.
     Any other close keeps the choices, so reopening picks up where it was. */
  function close() {
    const wasDone = step.kind === "done"
    setStep({ kind: "pick" })
    setError(null)
    setShare(false)
    if (wasDone) onBooked()
    else onClose()
  }

  function chooseSlot(slot: Slot) {
    if (!petId) {
      setError("Choose a pet first.")
      return
    }
    setError(null)
    setStep({ kind: "review", slot })
  }

  async function request(slot: Slot) {
    setBusy(true)
    setError(null)
    const res = await bookVetAppointment({
      businessId: bizId,
      typeId,
      petId,
      startsAt: slot.startsAt,
      staffId: slot.staffId,
      share,
    })
    setBusy(false)
    if (res.error) setError(res.error)
    else setStep({ kind: "done", status: res.status, startsAt: slot.startsAt })
  }

  const footer =
    step.kind === "pick" ? (
      <Button variant="secondary" onClick={close}>Close</Button>
    ) : step.kind === "review" ? (
      <>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setError(null)
            setStep({ kind: "pick" })
          }}
        >
          Pick another time
        </Button>
        <Button busy={busy} onClick={() => void request(step.slot)}>
          Request appointment
        </Button>
      </>
    ) : (
      <Button onClick={close}>Done</Button>
    )

  return (
    <Modal
      open={open}
      onClose={close}
      title={step.kind === "review" ? "Check your request" : step.kind === "done" ? "Request sent" : "Book with a vet"}
      description={
        step.kind === "pick"
          ? "Pick a time from the practice's real calendar. You'll check the details before anything is sent."
          : undefined
      }
      footer={footer}
    >
      {step.kind === "done" ? (
        <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
            <Check className="h-6 w-6 text-success" aria-hidden="true" />
          </span>
          {/* owner_book_appointment books outright when the practice's visit
              type needs no confirmation; saying "will confirm" then would be
              untrue. */}
          <p className="text-[15px] font-semibold text-foreground">
            {step.status === "booked"
              ? `Booked. ${practiceName} has you down for ${formatDateShort(step.startsAt)} at ${formatTime(step.startsAt, tz)}.`
              : `Request sent. ${practiceName} will confirm.`}
          </p>
          <p className="text-[12.5px] text-muted-foreground">You&apos;ll find it under Appointments.</p>
        </div>
      ) : step.kind === "review" ? (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-border p-3 text-[13px]">
            <dt className="text-muted-foreground">Practice</dt>
            <dd className="font-semibold text-foreground">{practiceName}</dd>
            <dt className="text-muted-foreground">Pet</dt>
            <dd className="font-semibold text-foreground">{petName}</dd>
            <dt className="text-muted-foreground">Reason</dt>
            <dd className="font-semibold text-foreground">
              {type ? `${type.name} (${type.durationMin} min)` : "Appointment"}
            </dd>
            <dt className="text-muted-foreground">Time</dt>
            <dd className="font-semibold text-foreground">
              {formatDateShort(step.slot.startsAt)} at {formatTime(step.slot.startsAt, tz)}
              {step.slot.staffName ? ` with ${step.slot.staffName}` : ""}
            </dd>
            {type && type.priceCents > 0 && (
              <>
                <dt className="text-muted-foreground">Price</dt>
                <dd className="font-semibold text-foreground">
                  {formatMoney(type.priceCents)}
                  <span className="block text-[11.5px] font-normal text-muted-foreground">
                    The practice&apos;s listed price. You pay them directly.
                  </span>
                </dd>
              </>
            )}
          </dl>
          <label className="flex items-start gap-2 text-[12.5px]">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-semibold text-foreground">Share the basics with this practice</span>
              <span className="block text-muted-foreground">
                Details, vaccinations and health notes, until 30 days after the visit. Only verified practices
                receive them.
              </span>
            </span>
          </label>
          {error && (
            <p role="alert" className="text-[12px] text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Practice" required>
            {(p) => (
              <Select {...p} value={bizId} onChange={(e) => { setBizId(e.target.value); setTypeId("") }}>
                <option value="">Choose…</option>
                {dir.data.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pet" required>
              {(p) => (
                <Select {...p} value={petId} onChange={(e) => { setPetId(e.target.value); setError(null) }}>
                  <option value="">Choose…</option>
                  {pets.map((pt) => (
                    <option key={pt.id} value={pt.id}>{pt.name}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Reason" required>
              {(p) => (
                <Select {...p} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                  <option value="">Choose…</option>
                  {bookable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.durationMin} min)
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Date">
            {(p) => <TextInput {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>

          {error && (
            <p role="alert" className="text-[12px] text-destructive">
              {error}
            </p>
          )}

          {bizId && typeId ? (
            slots.isLoading ? (
              <Spinner label="Finding times" />
            ) : slots.error ? (
              <LoadError message="Couldn't load times for that day." onRetry={slots.refetch} />
            ) : slots.data.length === 0 ? (
              <EmptyState title="No times that day" detail="Try another date." />
            ) : (
              <div role="group" aria-label="Available times" className="flex flex-wrap gap-1.5">
                {slots.data.slice(0, 24).map((s) => (
                  <Button key={`${s.startsAt}-${s.staffId}`} size="sm" variant="secondary" onClick={() => chooseSlot(s)}>
                    {formatTime(s.startsAt, tz)}
                  </Button>
                ))}
              </div>
            )
          ) : bizId && !types.isLoading && bookable.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              This practice doesn&apos;t take online bookings yet. Call them to book.
            </p>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">Choose a practice and a reason to see times.</p>
          )}
        </div>
      )}
    </Modal>
  )
}
