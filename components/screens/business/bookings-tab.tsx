"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  useOwnerBookings,
  setBookingStatus,
  markBookingPaid,
  businessCancelBooking,
  fetchBookingContact,
  BOOKING_STATUS_LABEL,
  type BookingStatus,
  type OwnerBooking,
} from "@/lib/data/bookings"
import { formatPrice } from "@/lib/data/business"
import { bookingContactState } from "@/lib/data/business-contact"
import type { BookingContact } from "@/lib/data/cancel-errors"
import { ContactLinks } from "@/components/screens/shared/contact-links"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SectionCard, EmptyState, Spinner, LoadError, TextInput } from "./business-ui"
import { Inbox, Check, X, Play, CircleCheck, DollarSign, Clock, Dog, CalendarDays } from "lucide-react"

type Segment = "requests" | "upcoming" | "active" | "history"

const SEGMENTS: { id: Segment; label: string; statuses: BookingStatus[] }[] = [
  { id: "requests", label: "Requests", statuses: ["requested"] },
  { id: "upcoming", label: "Upcoming", statuses: ["confirmed"] },
  { id: "active", label: "In progress", statuses: ["in_progress"] },
  { id: "history", label: "History", statuses: ["completed", "paid", "declined", "cancelled"] },
]

// A status is a Badge variant; the words stay dark.
const STATUS_BADGE: Record<BookingStatus, "neutral" | "brand" | "success" | "warning" | "danger" | "info"> = {
  requested: "warning",
  confirmed: "brand",
  in_progress: "info",
  completed: "success",
  paid: "success",
  declined: "danger",
  cancelled: "neutral",
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
  const [cancelling, setCancelling] = useState<OwnerBooking | null>(null)

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

  /* Cancelling goes through business_cancel_booking, never a plain status
     update: the RPC records who cancelled and why, and that is what tells the
     customer. The dialog keeps a failure on screen, so only success toasts. */
  async function cancelWithReason(b: OwnerBooking, why: string | null): Promise<{ error: string | null }> {
    const { error: e } = await businessCancelBooking(b.id, why ?? "")
    if (e) return { error: e }
    toast.success("Booking cancelled")
    refetch()
    return { error: null }
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
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-meta font-semibold transition-colors ${
              seg === s.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {s.label}
            {counts[s.id] > 0 && (
              <span className={`rounded-full px-1.5 text-caption ${seg === s.id ? "bg-primary-soft" : "bg-background"}`}>
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
              onStartCancel={() => setCancelling(b)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel this booking?"
        description={
          cancelling
            ? `This cancels ${cancelling.serviceName ?? "the booking"} for ${cancelling.customerName}. They're told, with your reason.`
            : ""
        }
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        tone="danger"
        reason={{ label: "Reason (the customer sees this)", required: true, placeholder: "Groomer is out sick that day" }}
        onConfirm={(why) => (cancelling ? cancelWithReason(cancelling, why) : Promise.resolve({ error: null }))}
      />
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
  onStartCancel,
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
  onStartCancel: () => void
}) {
  const age = hoursSince(b.createdAt)
  const overdue = b.status === "requested" && age > 4

  return (
    <SectionCard>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE[b.status]}>{BOOKING_STATUS_LABEL[b.status]}</Badge>
            <span className="text-body font-semibold text-foreground">{b.serviceName ?? "Service"}</span>
            {b.durationMin ? <span className="text-caption text-muted-foreground">· {b.durationMin} min</span> : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Dog className="h-3.5 w-3.5" />
              {b.petName ?? "Pet"}
              {b.petBreed ? ` (${b.petBreed})` : ""}
            </span>
            <span>· {b.customerName}</span>
          </p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-caption text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> {when(b.scheduledFor)}
          </p>
          {b.note && <p className="mt-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-caption text-foreground">“{b.note}”</p>}
          {b.declinedReason && (
            <p className="mt-1.5 text-caption text-foreground">Declined: {b.declinedReason}</p>
          )}
          <CustomerContact bookingId={b.id} status={b.status} name={b.customerName} />
        </div>

        {/* The customer pays this price to you; Pet10x bills its fee separately.
            What you keep is always visible before accepting. */}
        <div className="text-right">
          <p className="text-body font-bold text-foreground">{formatPrice(b.amountCents, b.currency)}</p>
          <p className="text-caption text-muted-foreground">
            −{formatPrice(b.commissionCents, b.currency)} Pet10x fee
          </p>
          <p className="text-caption font-semibold text-foreground">
            {formatPrice(b.amountCents - b.commissionCents, b.currency)} you keep
          </p>
        </div>
      </div>

      {b.status === "requested" && (
        <p className={`mt-2 inline-flex items-center gap-1 text-caption ${overdue ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
          <Clock className={`h-3.5 w-3.5 ${overdue ? "text-destructive" : ""}`} />
          {overdue ? "Overdue — " : ""}
          requested {age < 1 ? "just now" : `${Math.floor(age)}h ago`} · 4h response target
        </p>
      )}

      {declining ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <TextInput value={reason} onChange={setReason} placeholder="Reason (shared with the customer)" />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() =>
                onAct(b.id, "Booking declined", () =>
                  setBookingStatus(b.id, "declined", { declinedReason: reason.trim() || "Unavailable" }),
                ).then(onDeclined)
              }
            >
              {!busy && <X className="h-3.5 w-3.5 text-destructive" />} Confirm decline
            </Button>
            <Button size="sm" variant="quiet" onClick={onCancelDecline}>
              Keep
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {b.status === "requested" && (
            <>
              <Action busy={busy} tone="accept" icon={<Check className="h-3.5 w-3.5" />} label="Accept"
                onClick={() => onAct(b.id, "Booking confirmed", () => setBookingStatus(b.id, "confirmed"))} />
              <Action busy={busy} tone="deny" icon={<X className="h-3.5 w-3.5 text-destructive" />} label="Decline" onClick={onStartDecline} />
            </>
          )}
          {b.status === "confirmed" && (
            <>
              <Action busy={busy} tone="accept" icon={<Play className="h-3.5 w-3.5" />} label="Start job"
                onClick={() => onAct(b.id, "Job started", () => setBookingStatus(b.id, "in_progress"))} />
              <Action busy={busy} tone="neutral" icon={<X className="h-3.5 w-3.5 text-destructive" />} label="Cancel" onClick={onStartCancel} />
            </>
          )}
          {b.status === "in_progress" && (
            <Action busy={busy} tone="accept" icon={<CircleCheck className="h-3.5 w-3.5" />} label="Mark complete"
              onClick={() => onAct(b.id, "Job completed", () => setBookingStatus(b.id, "completed"))} />
          )}
          {b.status === "completed" && (
            <>
              {/* The customer pays you directly; marking it paid is your record that they did. */}
              <p className="w-full text-caption font-semibold text-foreground">
                Completed — collect {formatPrice(b.amountCents, b.currency)}
              </p>
              <Action busy={busy} tone="money" icon={<DollarSign className="h-3.5 w-3.5" />} label="Mark paid"
                onClick={() => onAct(b.id, "Payment recorded", () => markBookingPaid(b.id))} />
            </>
          )}
        </div>
      )}
    </SectionCard>
  )
}

/**
 * The customer's phone and email, once the booking is confirmed. Fetched per
 * card, and only for a status business_booking_contact answers, so a request
 * never asks and a cancelled booking never shows stale details. Keyed on the
 * status: confirming a request fetches on the next render.
 */
function CustomerContact({ bookingId, status, name }: { bookingId: string; status: BookingStatus; name: string }) {
  const state = bookingContactState(status)
  const [loaded, setLoaded] = useState<{ key: string; contact: BookingContact | null; error: string | null } | null>(null)
  const key = `${bookingId}:${status}`

  useEffect(() => {
    if (state !== "shared") return
    let live = true
    void fetchBookingContact(bookingId).then(({ email, phone, error }) => {
      if (live) setLoaded({ key, contact: error ? null : { email, phone }, error })
    })
    return () => {
      live = false
    }
  }, [bookingId, key, state])

  if (state === "after_confirm") {
    return <p className="mt-1.5 text-caption text-muted-foreground">Contact shared once you confirm</p>
  }
  if (state !== "shared") return null
  const current = loaded?.key === key ? loaded : null
  if (!current) return <p className="mt-1.5 text-caption text-muted-foreground">Loading contact details…</p>
  if (current.error) return <p className="mt-1.5 text-caption text-muted-foreground">{current.error}</p>
  if (!current.contact?.phone && !current.contact?.email) {
    return <p className="mt-1.5 text-caption text-muted-foreground">{name} hasn&apos;t added a phone or email.</p>
  }
  return (
    <div className="mt-1.5">
      <ContactLinks phone={current.contact.phone} email={current.contact.email} />
    </div>
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
  // Accept and money are the forward steps (primary); deny and cancel are
  // secondary, with the red on the icon rather than the words.
  const forward = tone === "accept" || tone === "money"
  return (
    <Button size="sm" variant={forward ? "primary" : "secondary"} onClick={onClick} loading={busy}>
      {!busy && icon}
      {label}
    </Button>
  )
}
