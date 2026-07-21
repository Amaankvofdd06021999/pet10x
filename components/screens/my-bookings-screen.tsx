"use client"

import { useState } from "react"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import {
  useMyBookings,
  cancelBooking,
  submitReview,
  BOOKING_STATUS_LABEL,
  type BookingStatus,
  type CustomerBooking,
} from "@/lib/data/bookings"
import { ArrowLeft, CalendarDays, Loader2, Star, Store, Inbox } from "lucide-react"

const STATUS_STYLE: Record<BookingStatus, string> = {
  requested: "bg-warning/15 text-warning",
  confirmed: "bg-accent/15 text-accent",
  in_progress: "bg-info/15 text-info",
  completed: "bg-success/15 text-success",
  paid: "bg-success/15 text-success",
  declined: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
}

const STATUS_HINT: Partial<Record<BookingStatus, string>> = {
  requested: "Waiting for the business to confirm",
  confirmed: "Confirmed — see you then",
  in_progress: "Happening now",
  completed: "All done — payment pending",
  paid: "Paid",
}

export function MyBookingsScreen({ onBack }: { onBack: () => void }) {
  const { data: bookings, isLoading, refetch } = useMyBookings()
  const [busy, setBusy] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<CustomerBooking | null>(null)

  async function cancel(b: CustomerBooking) {
    if (!confirm(`Cancel your ${b.serviceName ?? "booking"} with ${b.businessName}?`)) return
    setBusy(b.id)
    const { error } = await cancelBooking(b.id)
    setBusy(null)
    if (error) return toast.error("Couldn't cancel", { description: error })
    toast.success("Booking cancelled")
    refetch()
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="My bookings"
        largeTitle={false}
        leftAction={
          <button onClick={onBack} className="flex items-center gap-1 text-[15px] text-primary">
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
      />

      <main className="ios-scroll flex-1 px-4 pb-24 pt-3">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <Inbox className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-[14px] font-semibold text-foreground">No bookings yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Browse Services to book a groomer, vet or walker near you.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-2xl border border-border bg-card p-3.5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
                    <Store className="h-5 w-5 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_STYLE[b.status]}`}>
                        {BOOKING_STATUS_LABEL[b.status]}
                      </span>
                      <p className="text-[14px] font-semibold text-foreground">{b.serviceName ?? "Service"}</p>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                      {b.businessName}
                      {b.petName ? ` · ${b.petName}` : ""}
                    </p>
                    {b.scheduledFor && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(b.scheduledFor).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                    {STATUS_HINT[b.status] && (
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">{STATUS_HINT[b.status]}</p>
                    )}
                    {b.declinedReason && <p className="mt-1 text-[12px] text-destructive">{b.declinedReason}</p>}
                  </div>
                  <span className="flex-shrink-0 text-[15px] font-bold text-foreground">${b.amount.toFixed(2)}</span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {(b.status === "requested" || b.status === "confirmed") && (
                    <button
                      onClick={() => cancel(b)}
                      disabled={busy === b.id}
                      className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-foreground disabled:opacity-50"
                    >
                      {busy === b.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Cancel
                    </button>
                  )}
                  {(b.status === "completed" || b.status === "paid") &&
                    (b.reviewId ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" /> You rated {b.reviewRating}/5
                      </span>
                    ) : (
                      <button
                        onClick={() => setReviewing(b)}
                        className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-[12.5px] font-semibold text-accent"
                      >
                        <Star className="h-3.5 w-3.5" /> Leave a review
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {reviewing && (
        <ReviewSheet
          booking={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}

function ReviewSheet({
  booking,
  onClose,
  onDone,
}: {
  booking: CustomerBooking
  onClose: () => void
  onDone: () => void
}) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const { error } = await submitReview({
      businessId: booking.businessId,
      bookingId: booking.id,
      rating,
      comment,
    })
    setBusy(false)
    if (error) return toast.error("Couldn't post review", { description: error })
    toast.success("Thanks for the review!")
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[17px] font-semibold text-foreground">Review {booking.businessName}</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{booking.serviceName}</p>

        <div className="mt-4 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} onClick={() => setRating(i)} aria-label={`${i} star${i === 1 ? "" : "s"}`}>
              <Star className={`h-9 w-9 ${i <= rating ? "fill-warning text-warning" : "text-muted-foreground/40"}`} />
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="How did it go?"
          className="mt-4 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground focus:border-accent focus:outline-none"
        />

        <div className="mt-3 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-muted py-3 text-[15px] font-semibold text-foreground">
            Not now
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Post review
          </button>
        </div>
      </div>
    </div>
  )
}
