"use client"

import { useState } from "react"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { usePublicBusiness, isOpenNow, DAY_KEYS, DAY_LABEL } from "@/lib/data/business"
import { useBusinessServices, useBusinessReviews, createBooking, type ServiceItem } from "@/lib/data/bookings"
import { usePets } from "@/lib/data"
import { ArrowLeft, Store, Star, Clock, Loader2, CalendarDays, Check, MessageSquare } from "lucide-react"

/** Default the booking to tomorrow at 10:00 — a sane, always-valid slot. */
function defaultSlot(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  // datetime-local wants local time without the timezone suffix
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BusinessDetailScreen({ businessId, onBack }: { businessId?: string; onBack: () => void }) {
  const { data: biz, isLoading } = usePublicBusiness(businessId)
  const { data: services } = useBusinessServices(businessId)
  const { data: reviews } = useBusinessReviews(businessId)
  const [booking, setBooking] = useState<ServiceItem | null>(null)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!biz) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <IOSNavBar title="Service" largeTitle={false} leftAction={<BackBtn onBack={onBack} />} />
        <p className="p-8 text-center text-[14px] text-muted-foreground">This business isn&apos;t available.</p>
      </div>
    )
  }

  const active = services.filter((s) => s.active)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar title={biz.name} largeTitle={false} leftAction={<BackBtn onBack={onBack} />} />

      <main className="ios-scroll flex-1 px-4 pb-28">
        {/* Header */}
        <div className="flex items-start gap-3 py-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-accent/10">
            <Store className="h-7 w-7 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-bold tracking-tight text-foreground">{biz.name}</h1>
            <p className="text-[13px] text-muted-foreground">
              {biz.category}
              {biz.priceRange ? ` · ${biz.priceRange}` : ""}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${biz.openNow ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
              >
                {biz.openNow ? "Open now" : "Closed"}
              </span>
              {biz.ratingCount > 0 && (
                <span className="flex items-center gap-1 text-[12.5px] text-foreground">
                  <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                  {biz.ratingAvg.toFixed(1)}
                  <span className="text-muted-foreground">({biz.ratingCount})</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {biz.description && <p className="pb-3 text-[13.5px] leading-relaxed text-foreground">{biz.description}</p>}

        {biz.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-4">
            {biz.tags.map((t) => (
              <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Bookable catalog */}
        <h2 className="mb-2 text-[16px] font-semibold text-foreground">Services</h2>
        {active.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
            This business hasn&apos;t published a service list yet.
          </p>
        ) : (
          <div className="space-y-2">
            {active.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-foreground">{s.name}</p>
                  {s.description && <p className="text-[12.5px] text-muted-foreground">{s.description}</p>}
                  {s.durationMin ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> {s.durationMin} min
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                  <span className="text-[16px] font-bold text-foreground">${(s.priceCents / 100).toFixed(2)}</span>
                  <button
                    onClick={() => setBooking(s)}
                    className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white"
                  >
                    Book
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hours */}
        {biz.hours && (
          <>
            <h2 className="mb-2 mt-6 text-[16px] font-semibold text-foreground">Hours</h2>
            <div className="rounded-2xl border border-border bg-card p-3.5">
              {DAY_KEYS.map((d) => {
                const v = biz.hours?.[d]
                const isToday = DAY_KEYS[(new Date().getDay() + 6) % 7] === d
                return (
                  <div key={d} className={`flex justify-between py-1 text-[13px] ${isToday ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    <span>{DAY_LABEL[d]}</span>
                    <span>{v ? `${v.open} – ${v.close}` : "Closed"}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Reviews */}
        <h2 className="mb-2 mt-6 text-[16px] font-semibold text-foreground">
          Reviews {reviews.length > 0 && <span className="text-muted-foreground">({reviews.length})</span>}
        </h2>
        {reviews.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
            No reviews yet.
          </p>
        ) : (
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-3.5">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${i <= r.rating ? "fill-warning text-warning" : "text-muted-foreground/40"}`}
                      />
                    ))}
                  </span>
                  <span className="text-[13px] font-semibold text-foreground">{r.authorName}</span>
                  <span className="ml-auto text-[11.5px] text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {r.comment && <p className="mt-1 text-[13px] text-foreground">{r.comment}</p>}
                {r.ownerReply && (
                  <div className="mt-2 flex gap-2 rounded-lg bg-muted/60 p-2.5">
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
                    <p className="text-[12.5px] text-muted-foreground">{r.ownerReply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {booking && <BookSheet business={biz.name} businessId={biz.id} service={booking} onClose={() => setBooking(null)} />}
    </div>
  )
}

function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} className="flex items-center gap-1 text-[15px] text-primary">
      <ArrowLeft className="h-5 w-5" />
    </button>
  )
}

function BookSheet({
  business,
  businessId,
  service,
  onClose,
}: {
  business: string
  businessId: string
  service: ServiceItem
  onClose: () => void
}) {
  const { data: pets } = usePets()
  const [petId, setPetId] = useState<string>("")
  const [slot, setSlot] = useState(defaultSlot())
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (!slot) return toast.error("Pick a date and time.")
    setBusy(true)
    const { error } = await createBooking({
      businessId,
      serviceId: service.id,
      priceCents: service.priceCents,
      petId: petId || null,
      scheduledFor: new Date(slot).toISOString(),
      note,
    })
    setBusy(false)
    if (error) return toast.error("Couldn't send request", { description: error })
    setDone(true)
    toast.success("Request sent", { description: `${business} will confirm shortly.` })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
              <Check className="h-6 w-6 text-success" />
            </span>
            <p className="text-[16px] font-semibold text-foreground">Booking requested</p>
            <p className="text-[13px] text-muted-foreground">
              {business} has your request for {service.name}. You&apos;ll see it under My bookings.
            </p>
            <button onClick={onClose} className="mt-1 w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-white">
              Done
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-[17px] font-semibold text-foreground">Book {service.name}</h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {business} · ${(service.priceCents / 100).toFixed(2)}
              {service.durationMin ? ` · ${service.durationMin} min` : ""}
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <div>
                <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Which pet?</p>
                <select
                  value={petId}
                  onChange={(e) => setPetId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="">Not specified</option>
                  {pets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.breed ? `· ${p.breed}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Preferred date &amp; time
                </p>
                <input
                  type="datetime-local"
                  value={slot}
                  onChange={(e) => setSlot(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Anything they should know?
                </p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Nervous with dryers, prefers mornings…"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3.5 py-2.5">
                <span className="text-[13px] text-muted-foreground">Total</span>
                <span className="text-[16px] font-bold text-foreground">${(service.priceCents / 100).toFixed(2)}</span>
              </div>

              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 rounded-xl bg-muted py-3 text-[15px] font-semibold text-foreground">
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-[15px] font-semibold text-white disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                  Request
                </button>
              </div>
              <p className="text-center text-[11.5px] text-muted-foreground">
                You&apos;ll only be charged after the job is completed.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
