"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import { useClinicLocations, useClinicStaff } from "@/lib/data/clinic/context"
import {
  useDayAppointments, useAppointmentTypes, createAppointment, setAppointmentStatus,
  NEXT_STATUS, STATUS_LABEL, type Appointment, type AppointmentStatus,
} from "@/lib/data/clinic/schedule"
import { useClinicPatients } from "@/lib/data/clinic/customers"
import { formatTime, todayISO, addDaysISO, formatDayLabel, minutesInto } from "@/lib/data/clinic/time"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Modal,
  Field, TextInput, Select, SpeciesIcon, LinkedBadge, Toolbar,
} from "@/components/screens/shared/ui"

const DAY_START_MIN = 7 * 60
const DAY_END_MIN = 20 * 60
const PX_PER_MIN = 1.15

const STATUS_TONE: Record<AppointmentStatus, "neutral" | "good" | "warn" | "bad" | "info" | "accent"> = {
  requested: "warn",
  booked: "neutral",
  arrived: "info",
  in_progress: "accent",
  ready: "warn",
  completed: "good",
  no_show: "bad",
  cancelled: "neutral",
}

export function ClinicCalendarScreen({ clinic }: { clinic: ClinicMembership }) {
  const { data: locations } = useClinicLocations(clinic.businessId)
  const tz = locations.find((l) => l.isPrimary)?.timezone ?? "America/Vancouver"
  const [date, setDate] = useState(() => todayISO(new Date(), tz))
  const appts = useDayAppointments(clinic.businessId, date, tz)
  const types = useAppointmentTypes(clinic.businessId)
  const staff = useClinicStaff(clinic.businessId)
  const [bookOpen, setBookOpen] = useState(false)
  const [selected, setSelected] = useState<Appointment | null>(null)

  const columns = useMemo(() => {
    const bookable = staff.data.filter((s) => s.isBookable && s.isActive)
    if (bookable.length === 0) return [{ id: null as string | null, name: "Unassigned" }]
    return bookable.map((s) => ({ id: s.id as string | null, name: s.name }))
  }, [staff.data])

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <Button variant="secondary" size="sm" aria-label="Previous day" onClick={() => setDate(addDaysISO(date, -1))}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setDate(todayISO(new Date(), tz))}>
          Today
        </Button>
        <Button variant="secondary" size="sm" aria-label="Next day" onClick={() => setDate(addDaysISO(date, 1))}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <p className="text-[14px] font-semibold text-foreground">{formatDayLabel(date, tz)}</p>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setBookOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Book
          </Button>
        </div>
      </Toolbar>

      {appts.isLoading ? (
        <Spinner label="Loading the book" />
      ) : appts.error ? (
        <LoadError message={appts.error} onRetry={appts.refetch} />
      ) : appts.data.length === 0 ? (
        <EmptyState
          title="Nothing booked"
          detail={`${formatDayLabel(date, tz)} is clear.`}
          icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
          action={<Button size="sm" onClick={() => setBookOpen(true)}>Book an appointment</Button>}
        />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <div className="flex min-w-[640px] gap-2">
              {/* Hour gutter */}
              <div className="w-12 flex-shrink-0" aria-hidden="true">
                <div className="h-7" />
                <div className="relative" style={{ height: (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN }}>
                  {Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground"
                      style={{ top: i * 60 * PX_PER_MIN }}
                    >
                      {String(7 + i).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
              </div>

              {columns.map((col) => (
                <div key={col.id ?? "none"} className="min-w-[180px] flex-1">
                  <p className="mb-1 h-6 truncate text-[12.5px] font-semibold text-foreground">{col.name}</p>
                  <div
                    className="relative rounded-xl border border-border bg-background"
                    style={{ height: (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN }}
                  >
                    {Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute inset-x-0 border-t border-border/60"
                        style={{ top: i * 60 * PX_PER_MIN }}
                        aria-hidden="true"
                      />
                    ))}
                    {appts.data
                      .filter((a) => (a.staffId ?? null) === col.id)
                      .map((a) => {
                        const top = (minutesInto(a.startsAt, date, tz) - DAY_START_MIN) * PX_PER_MIN
                        const height = Math.max(
                          22,
                          ((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000) * PX_PER_MIN,
                        )
                        const dim = a.status === "cancelled" || a.status === "no_show"
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setSelected(a)}
                            className={`absolute inset-x-1 overflow-hidden rounded-lg border p-1.5 text-left transition-shadow hover:shadow-float ${
                              dim ? "opacity-50" : ""
                            }`}
                            style={{
                              top: Math.max(0, top),
                              height,
                              borderColor: a.colour,
                              backgroundColor: `${a.colour}1A`,
                            }}
                          >
                            <span className="block truncate text-[11.5px] font-semibold text-foreground">
                              {formatTime(a.startsAt, tz)} {a.patientName}
                            </span>
                            <span className="block truncate text-[10.5px] text-muted-foreground">
                              {a.typeName} · {STATUS_LABEL[a.status]}
                            </span>
                          </button>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      <BookModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        clinic={clinic}
        date={date}
        tz={tz}
        onBooked={() => {
          setBookOpen(false)
          appts.refetch()
        }}
        types={types.data}
        staff={staff.data.filter((s) => s.isBookable)}
        locationId={locations.find((l) => l.isPrimary)?.id ?? null}
      />

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.patientName} · ${formatTime(selected.startsAt, tz)}` : ""}
        description={selected ? `${selected.customerName} · ${selected.typeName}` : undefined}
        footer={
          selected && (
            <div className="flex flex-wrap gap-2">
              {NEXT_STATUS[selected.status].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === "cancelled" || s === "no_show" ? "secondary" : "primary"}
                  onClick={async () => {
                    const res = await setAppointmentStatus(selected.id, s)
                    if (res.error) window.alert(res.error)
                    else {
                      setSelected(null)
                      appts.refetch()
                    }
                  }}
                >
                  {STATUS_LABEL[s]}
                </Button>
              ))}
            </div>
          )
        }
      >
        {selected && (
          <div className="flex flex-col gap-2 text-[13px]">
            <p className="flex items-center gap-2">
              <SpeciesIcon species={selected.species} />
              <span className="font-semibold">{selected.patientName}</span>
              <LinkedBadge linked={selected.isLinked} />
              <Pill tone={STATUS_TONE[selected.status]}>{STATUS_LABEL[selected.status]}</Pill>
            </p>
            {selected.behaviouralAlert && (
              <p className="rounded-lg bg-warning/10 p-2 text-[12.5px] font-medium text-warning-strong">
                Handling note: {selected.behaviouralAlert}
              </p>
            )}
            <p className="text-muted-foreground">
              {selected.customerName}
              {selected.customerPhone ? ` · ${selected.customerPhone}` : ""}
            </p>
            <p className="text-muted-foreground">Booked {selected.source === "online" ? "online by the owner" : "by the practice"}</p>
            {selected.note && <p className="rounded-lg bg-secondary p-2 text-[12.5px]">{selected.note}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}

function BookModal({
  open, onClose, clinic, date, tz, onBooked, types, staff, locationId,
}: {
  open: boolean
  onClose: () => void
  clinic: ClinicMembership
  date: string
  tz: string
  onBooked: () => void
  types: Array<{ id: string; name: string; durationMin: number }>
  staff: Array<{ id: string; name: string }>
  locationId: string | null
}) {
  const [search, setSearch] = useState("")
  const patients = useClinicPatients(clinic.businessId, search)
  const [patientId, setPatientId] = useState("")
  const [typeId, setTypeId] = useState("")
  const [staffId, setStaffId] = useState("")
  const [time, setTime] = useState("09:00")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = patients.data.find((p) => p.id === patientId)
  const type = types.find((t) => t.id === typeId) ?? types[0]

  async function submit() {
    setError(null)
    if (!patientId) return setError("Choose a patient.")
    if (!type) return setError("Choose an appointment type.")
    const startsAt = new Date(`${date}T${time}:00`)
    if (Number.isNaN(startsAt.getTime())) return setError("That time is not valid.")
    setBusy(true)
    const res = await createAppointment({
      businessId: clinic.businessId,
      patientId,
      customerId: chosen?.customerId ?? null,
      typeId: type.id,
      staffId: staffId || null,
      locationId,
      startsAt: startsAt.toISOString(),
      durationMin: type.durationMin,
      reason: type.name,
      note,
    })
    setBusy(false)
    if (res.error) setError(res.error)
    else onBooked()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book an appointment"
      description={`${date} · times are in the practice's timezone (${tz})`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} busy={busy}>Book</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Find a patient" hint="Name, breed or microchip">
          {(p) => (
            <TextInput {...p} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bramble" />
          )}
        </Field>
        <Field label="Patient" required error={error && !patientId ? error : null}>
          {(p) => (
            <Select {...p} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">Choose…</option>
              {patients.data.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name} — {pt.customerName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" required>
            {(p) => (
              <Select {...p} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.durationMin} min)
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Start time" required>
            {(p) => <TextInput {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
        </div>
        <Field label="Clinician">
          {(p) => (
            <Select {...p} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Note">
          {(p) => <TextInput {...p} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Limping on left hind" />}
        </Field>
        {error && patientId && <p className="text-[12px] text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}
