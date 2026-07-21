"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  useOwnerBookings,
  setBookingStatus,
  markBookingPaid,
  BOOKING_STATUS_LABEL,
  type BookingStatus,
  type OwnerBooking,
} from "@/lib/data/bookings"
import { formatPrice } from "@/lib/data/business"
import { SectionCard, EmptyState, Spinner, LoadError, TextInput } from "./business-ui"
import { Inbox, Check, X, Play, CircleCheck, DollarSign, Clock, Dog, Loader2, CalendarDays } from "lucide-react"

type Segment = "requests" | "upcoming" | "active" | "history"

const SEGMENTS: { id: Segment; label: string; statuses: BookingStatus[] }[] = [
  { id: "requests", label: "Requests", statuses: ["requested"] },
  { id: "upcoming", label: "Upcoming", statuses: ["confirmed"] },
  { id: "active", label: "In progress", statuses: ["in_progress"] },
  { id: "history", label: "History", statuses: ["completed", "paid", "declined", "cancelled"] },
]

const STATUS_STYLE: Record<BookingStatus, string> = {
  requested: "bg-warning/15 text-warning",
  confirmed: "bg-accent/15 text-accent",
  in_progress: "bg-info/15 text-info",
  completed: "bg-success/15 text-success",
  paid: "bg-success/15 text-success",
  declined: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}
function when(iso: string | null): string {
  if (!iso) return "No date set"
  const d = new Date(iso)
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export function BookingsTab({ businessId }: { businessId: string }) {
  const { data: bookings, isLoading, error, refetch } = useOwnerBookings(businessId)
  const [seg, setSeg] = useState<Segment>("requests")
  const [busy, setBusy] = useState<string | null>(null)
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  const counts = useMemo(() => {
    const m: Record<Segment, number> = { requests: 0, upcoming: 0, active: 0, history: 0 }
    for (const s of SEGMENTS) m[s.id] = bookings.filter((b) => s.statuses.includes(b.status)).length
    return m
  }, [bookings])

  // Requests decay — default to the tab that actually needs attention.
  const [autoPicked, setAutoPicked] = useState(false)
  if (!autoPicked && !isLoading && counts.requests === 0 && bookings.length > 0) {
    setSeg("upcoming")
    setAutoPicked(true)
  }

  const list = bookings.filter((b) => SEGMENTS.find((s) => s.id === seg)!.statuses.includes(b.status))

  async function act(id: string, label: string, fn: () => Promise<{ error: string | null }>): Promise<void> {
    setBusy(id)
    const { error: e } = await fn()
    setBusy(null)
    if (e) {
      toast.error(`${label} failed`, { description: e })
      return
    }
    toast.success(label)
    refetch()
  }

  if (isLoading) return <Spinner />
  if (error) return <LoadError message={error} onRetry={refetch} />

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setSeg(s.id)
              setAutoPicked(true)
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              seg === s.id ? "bg-card text-accent shadow-sm" : "text-muted-foreground"
            }`}
          >
            {s.label}
            {counts[s.id] > 0 && (
              <span className={`rounded-full px-1.5 text-[10.5px] ${seg === s.id ? "bg-accent/15" : "bg-background"}`}>
                {counts[s.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-8 w-8" />}
          title={seg === "requests" ? "No new requests" : "Nothing here yet"}
          sub={seg === "requests" ? "New booking requests from residents land here." : undefined}
        />
      ) : (
        <div className="space-y-2">
          {list.map((b) => (
            <BookingCard
              key={b.id}
              b={b}
              busy={busy === b.id}
              declining={decliningId === b.id}
              reason={reason}
              setReason={setReason}
              onStartDecline={() => {
                setDecliningId(b.id)
                setReason("")
              }}
              onCancelDecline={() => setDecliningId(null)}
              onAct={act}
              onDeclined={() => setDecliningId(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BookingCard({
  b,
  busy,
  declining,
  reason,
  setReason,
  onStartDecline,
  onCancelDecline,
  onAct,
  onDeclined,
}: {
  b: OwnerBooking
  busy: boolean
  declining: boolean
  reason: string
  setReason: (v: string) => void
  onStartDecline: () => void
  onCancelDecline: () => void
  onAct: (id: string, label: string, fn: () => Promise<{ error: string | null }>) => Promise<void>
  onDeclined: () => void
}) {
  const age = hoursSince(b.createdAt)
  const overdue = b.status === "requested" && age > 4

  return (
    <SectionCard>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[b.status]}`}>
              {BOOKING_STATUS_LABEL[b.status]}
            </span>
            <span className="text-[14px] font-semibold text-foreground">{b.serviceName ?? "Service"}</span>
            {b.durationMin ? <span className="text-[11.5px] text-muted-foreground">· {b.durationMin} min</span> : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Dog className="h-3.5 w-3.5" />
              {b.petName ?? "Pet"}
              {b.petBreed ? ` (${b.petBreed})` : ""}
            </span>
            <span>· {b.customerName}</span>
          </p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> {when(b.scheduledFor)}
          </p>
          {b.note && <p className="mt-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[12.5px] text-foreground">“{b.note}”</p>}
          {b.declinedReason && (
            <p className="mt-1.5 text-[12px] text-destructive">Declined: {b.declinedReason}</p>
          )}
        </div>

        {/* Net-of-fee, always visible before accepting */}
        <div className="text-right">
          <p className="text-[16px] font-bold text-foreground">{formatPrice(b.amount * 100, b.currency)}</p>
          <p className="text-[11px] text-muted-foreground">
            −{formatPrice(b.commission * 100, b.currency)} fee
          </p>
          <p className="text-[12px] font-semibold text-success">{formatPrice(b.net * 100, b.currency)} net</p>
        </div>
      </div>

      {b.status === "requested" && (
        <p className={`mt-2 inline-flex items-center gap-1 text-[11.5px] ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
          <Clock className="h-3.5 w-3.5" />
          {overdue ? "Overdue — " : ""}
          requested {age < 1 ? "just now" : `${Math.floor(age)}h ago`} · 4h response target
        </p>
      )}

      {declining ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <TextInput value={reason} onChange={setReason} placeholder="Reason (shared with the customer)" />
          <div className="flex gap-2">
            <button
              onClick={() =>
                onAct(b.id, "Booking declined", () =>
                  setBookingStatus(b.id, "declined", { declinedReason: reason.trim() || "Unavailable" }),
                ).then(onDeclined)
              }
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-[12.5px] font-semibold text-destructive disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Confirm decline
            </button>
            <button onClick={onCancelDecline} className="rounded-lg bg-muted px-3 py-2 text-[12.5px] font-semibold text-foreground">
              Keep
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {b.status === "requested" && (
            <>
              <Action busy={busy} tone="accept" icon={<Check className="h-3.5 w-3.5" />} label="Accept"
                onClick={() => onAct(b.id, "Booking confirmed", () => setBookingStatus(b.id, "confirmed"))} />
              <Action busy={busy} tone="deny" icon={<X className="h-3.5 w-3.5" />} label="Decline" onClick={onStartDecline} />
            </>
          )}
          {b.status === "confirmed" && (
            <>
              <Action busy={busy} tone="accept" icon={<Play className="h-3.5 w-3.5" />} label="Start job"
                onClick={() => onAct(b.id, "Job started", () => setBookingStatus(b.id, "in_progress"))} />
              <Action busy={busy} tone="neutral" icon={<X className="h-3.5 w-3.5" />} label="Cancel"
                onClick={() => onAct(b.id, "Booking cancelled", () => setBookingStatus(b.id, "cancelled"))} />
            </>
          )}
          {b.status === "in_progress" && (
            <Action busy={busy} tone="accept" icon={<CircleCheck className="h-3.5 w-3.5" />} label="Mark complete"
              onClick={() => onAct(b.id, "Job completed", () => setBookingStatus(b.id, "completed"))} />
          )}
          {b.status === "completed" && (
            <Action busy={busy} tone="money" icon={<DollarSign className="h-3.5 w-3.5" />} label="Mark paid"
              onClick={() => onAct(b.id, "Payment recorded", () => markBookingPaid(b.id))} />
          )}
        </div>
      )}
    </SectionCard>
  )
}

function Action({
  label,
  icon,
  onClick,
  busy,
  tone,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  busy: boolean
  tone: "accept" | "deny" | "neutral" | "money"
}) {
  const cls =
    tone === "accept"
      ? "bg-success/15 text-success hover:bg-success/25"
      : tone === "deny"
        ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
        : tone === "money"
          ? "bg-accent/15 text-accent hover:bg-accent/25"
          : "bg-muted text-foreground hover:bg-muted/70"
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${cls}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  )
}
