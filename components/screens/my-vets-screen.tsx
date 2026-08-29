"use client"

import { useState } from "react"
import {
  ArrowLeft, ShieldCheck, ShieldOff, KeyRound, Stethoscope, Check, X,
  CalendarPlus, Copy,
} from "lucide-react"
import { usePets } from "@/lib/data"
import {
  useMyVetShares, useVetDirectory, usePendingLinkRequests, usePendingShareRequests,
  useClinicRecords, useMyVetAppointments, grantShare, revokeShare, createDeskCode,
  decideLinkRequest, decideShareRequest, bookVetAppointment,
  SCOPE_LABELS, DEFAULT_SCOPES,
} from "@/lib/data/owner-vets"
import { useAppointmentTypes, useAvailableSlots } from "@/lib/data/clinic/schedule"
import { formatDateShort, formatTime, todayISO, addDaysISO } from "@/lib/data/clinic/time"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Modal,
  Field, Select, TextInput, SegmentedTabs, Toolbar,
} from "@/components/screens/shared/ui"

type View = "sharing" | "records" | "visits"

/**
 * "Who can see my dog's records?" answered in three seconds, and undone in one
 * tap. Everything a practice can see is a row with a scope list and an expiry.
 */
export function MyVetsScreen({ onBack }: { onBack?: () => void }) {
  const [view, setView] = useState<View>("sharing")
  const pets = usePets()
  const shares = useMyVetShares()
  const links = usePendingLinkRequests()
  const shareReqs = usePendingShareRequests()
  const records = useClinicRecords()
  const appts = useMyVetAppointments()
  const [shareOpen, setShareOpen] = useState(false)
  const [codeFor, setCodeFor] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [bookOpen, setBookOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const pending = links.data.length + shareReqs.data.length

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
                        const res = await decideLinkRequest(r.id, true, petId)
                        if (res.error) window.alert(res.error)
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
                        if (res.error) window.alert(res.error)
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
                      if (res.error) window.alert(res.error)
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
                      if (res.error) window.alert(res.error)
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
                    <Button
                      size="sm"
                      variant="secondary"
                      busy={busy === s.shareId}
                      onClick={async () => {
                        const ok = window.confirm(
                          `Stop ${s.businessName} seeing anything new about ${s.petName}?\n\n` +
                            "This does not remove the appointment history and notes they keep in their own system.",
                        )
                        if (!ok) return
                        setBusy(s.shareId)
                        const res = await revokeShare(s.shareId)
                        setBusy(null)
                        if (res.error) window.alert(res.error)
                        else shares.refetch()
                      }}
                    >
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
                  if (res.error) window.alert(res.error)
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
          <EmptyState title="No appointments" detail="Book with a practice you have shared with." />
        ) : (
          <ul className="flex flex-col gap-2">
            {appts.data.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-4">
                <div>
                  <p className="text-[14px] font-semibold text-foreground">
                    {a.petName} · {a.reason ?? "Appointment"}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {a.businessName} · {formatDateShort(a.startsAt)} at{" "}
                    {formatTime(a.startsAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}
                  </p>
                </div>
                <Pill tone={a.status === "requested" ? "warn" : a.status === "completed" ? "good" : "neutral"}>
                  {a.status.replace(/_/g, " ")}
                </Pill>
              </li>
            ))}
          </ul>
        ))}

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
        onBooked={() => {
          setBookOpen(false)
          appts.refetch()
          shares.refetch()
        }}
      />
    </div>
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

function BookVetModal({
  open, onClose, pets, onBooked,
}: {
  open: boolean
  onClose: () => void
  pets: Array<{ id: string; name: string }>
  onBooked: () => void
}) {
  const dir = useVetDirectory("")
  const [bizId, setBizId] = useState("")
  const [petId, setPetId] = useState("")
  const [typeId, setTypeId] = useState("")
  const [date, setDate] = useState(() => addDaysISO(todayISO(), 1))
  const [share, setShare] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const types = useAppointmentTypes(bizId || null)
  const bookable = types.data.filter((t) => t.isOnlineBookable && t.isActive)
  const slots = useAvailableSlots(bizId || null, typeId || null, date)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book with a vet"
      description="Real availability, straight into their calendar."
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
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
              <Select {...p} value={petId} onChange={(e) => setPetId(e.target.value)}>
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
        <label className="flex items-start gap-2 text-[12.5px]">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-semibold text-foreground">Share the basics with this practice</span>
            <span className="block text-muted-foreground">
              Details, vaccinations and health notes, until 30 days after the visit.
            </span>
          </span>
        </label>

        {error && <p className="text-[12px] text-destructive">{error}</p>}

        {bizId && typeId ? (
          slots.isLoading ? (
            <Spinner label="Finding times" />
          ) : slots.data.length === 0 ? (
            <EmptyState title="No times that day" detail="Try another date." />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {slots.data.slice(0, 24).map((s) => (
                <Button
                  key={s.startsAt}
                  size="sm"
                  variant="secondary"
                  busy={busy}
                  onClick={async () => {
                    if (!petId) {
                      setError("Choose a pet first.")
                      return
                    }
                    setBusy(true)
                    setError(null)
                    const res = await bookVetAppointment({
                      businessId: bizId,
                      typeId,
                      petId,
                      startsAt: s.startsAt,
                      staffId: s.staffId,
                      share,
                    })
                    setBusy(false)
                    if (res.error) setError(res.error)
                    else onBooked()
                  }}
                >
                  {formatTime(s.startsAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}
                </Button>
              ))}
            </div>
          )
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Choose a practice and a reason to see times.</p>
        )}
      </div>
    </Modal>
  )
}
