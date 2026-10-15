"use client"

import { useState } from "react"
import { toast } from "sonner"
import { DialogDescription, DialogLayer, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { IOSNavBar } from "@/components/ios-nav-bar"
import {
  useMyBookings,
  cancelBooking,
  submitReview,
  BOOKING_STATUS_LABEL,
  type BookingStatus,
  type CustomerBooking,
} from "@/lib/data/bookings"
import { formatPrice } from "@/lib/data/business"
import { bookingContactState } from "@/lib/data/business-contact"
import { userError } from "@/lib/user-error"
import { ContactLinks } from "@/components/screens/shared/contact-links"
import { ArrowLeft, CalendarDays, Loader2, Star, Store, Inbox } from "lucide-react"

const STATUS_STYLE: Record<BookingStatus, string> = {
  requested: "bg-warning/15 text-warning",
  confirmed: "bg-accent/15 text-accent",
  in_progress: "bg-info/15 text-info",
  completed: "bg-success/15 text-success-strong",
  paid: "bg-success/15 text-success-strong",
  declined: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
}

const STATUS_HINT: Partial<Record<BookingStatus, string>> = {
  requested: "Waiting for the business to confirm",
  confirmed: "Confirmed — see you then",
  in_progress: "Happening now",
  completed: "All done — pay the business directly",
  paid: "Paid",
}

export function MyBookingsScreen({ onBack }: { onBack: () => void }) {
  const { data: bookings, isLoading, refetch } = useMyBookings()
  const [busy, setBusy] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<CustomerBooking | null>(null)
  const [cancelling, setCancelling] = useState<CustomerBooking | null>(null)
  /* The booking whose cancel was refused because it has moved on. Its card
     shows the business's contact details and a line pointing at them. */
  const [blocked, setBlocked] = useState<string | null>(null)

  /* The dialog shows a failure in place and stays open, so the toast is only
     for success. cancelBooking maps every refusal to a sentence — the
     database's text never reaches the dialog. */
  async function cancel(b: CustomerBooking): Promise<{ error: string | null }> {
    setBusy(b.id)
    const { error, contactBusiness } = await cancelBooking(b.id)
    setBusy(null)
    /* "Contact the business" is only useful with a way to do it: when the
       business gave one, close the dialog and say so on the card, beside the
       number. Otherwise the sentence stays in the dialog. */
    if (error && contactBusiness && (b.businessPhone || b.businessEmail)) {
      setBlocked(b.id)
      refetch()
      return { error: null }
    }
    if (error) return { error }
    toast.success("Booking cancelled")
    refetch()
    return { error: null }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="My bookings"
        largeTitle={false}
        leftAction={
          <button onClick={onBack} className="flex items-center gap-1 text-[15px] text-primary-text">
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
              Book groomers and walkers in Services. Vet appointments are under My vets.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-2xl card-raised p-3.5">
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
                    {blocked === b.id && (
                      <p role="alert" className="mt-1 text-[12px] text-destructive">
                        This booking can&apos;t be cancelled any more.{" "}
                        <a href={`#booking-contact-${b.id}`} className="font-semibold underline underline-offset-2">
                          Contact {b.businessName}
                        </a>
                        .
                      </p>
                    )}
                    {/* Once confirmed, both sides can reach each other — the
                        business sees the customer's details from the same point. */}
                    {(bookingContactState(b.status) === "shared" || blocked === b.id) &&
                      (b.businessPhone || b.businessEmail) && (
                        <div id={`booking-contact-${b.id}`} className="mt-1.5">
                          <ContactLinks phone={b.businessPhone} email={b.businessEmail} />
                        </div>
                      )}
                  </div>
                  <span className="flex-shrink-0 text-[15px] font-bold text-foreground">{formatPrice(b.amount * 100, b.currency)}</span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {(b.status === "requested" || b.status === "confirmed") && (
                    <button
                      onClick={() => setCancelling(b)}
                      disabled={busy === b.id}
                      className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-foreground disabled:opacity-50"
                    >
                      {busy === b.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Cancel
                    </button>
                  )}
                  {(b.status === "completed" || b.status === "paid") &&
                    b.businessId &&
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

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel this booking?"
        description={
          cancelling
            ? `This cancels your ${cancelling.serviceName ?? "booking"} with ${cancelling.businessName}. The business is told.`
            : ""
        }
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        tone="danger"
        onConfirm={() => (cancelling ? cancel(cancelling) : Promise.resolve({ error: null }))}
      />

      {reviewing?.businessId && (
        <ReviewSheet
          booking={{ ...reviewing, businessId: reviewing.businessId }}
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
  booking: CustomerBooking & { businessId: string }
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
    if (error) return toast.error("Couldn't post review", { description: userError(error, "Try again in a moment.") })
    toast.success("Thanks for the review!")
    onDone()
  }

  return (
    // Escape and a tap outside close it like "Not now" — but not mid-post,
    // so a slow save can't be abandoned half-way.
    <DialogLayer
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
      described
      overlayClassName="flex items-end justify-center bg-foreground/40 sm:items-center"
      className="w-full max-w-md rounded-t-3xl bg-card shadow-float p-5 sm:rounded-3xl"
    >
        <DialogTitle className="text-[17px] font-semibold leading-normal text-foreground">Review {booking.businessName}</DialogTitle>
        <DialogDescription className="mt-0.5 text-[13px] text-muted-foreground">{booking.serviceName}</DialogDescription>

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
          aria-label="Your review"
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
    </DialogLayer>
  )
}
