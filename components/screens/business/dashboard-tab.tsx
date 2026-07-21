"use client"

import { useMemo } from "react"
import { profileCompleteness, type MyBusiness } from "@/lib/data/business"
import { useOwnerBookings, useBusinessServices, useBusinessReviews, computeEarnings } from "@/lib/data/bookings"
import { StatTile, SectionCard, Spinner, Stars } from "./business-ui"
import { BadgeCheck, AlertTriangle, Inbox, CalendarDays, DollarSign, MessageSquare, ChevronRight, Clock } from "lucide-react"

export function DashboardTab({
  business,
  onOpenTab,
}: {
  business: MyBusiness
  onOpenTab: (t: "bookings" | "storefront" | "earnings" | "reviews") => void
}) {
  const { data: bookings, isLoading } = useOwnerBookings(business.id)
  const { data: services } = useBusinessServices(business.id)
  const { data: reviews } = useBusinessReviews(business.id)

  const completeness = profileCompleteness(business, services.length)
  const earnings = computeEarnings(bookings)

  const requests = bookings.filter((b) => b.status === "requested")
  const todayJobs = useMemo(() => {
    const today = new Date().toDateString()
    return bookings.filter(
      (b) => b.scheduledFor && new Date(b.scheduledFor).toDateString() === today && ["confirmed", "in_progress"].includes(b.status),
    )
  }, [bookings])
  const booked30d = bookings
    .filter((b) => new Date(b.createdAt).getTime() > Date.now() - 30 * 86_400_000 && b.status !== "declined" && b.status !== "cancelled")
    .reduce((s, b) => s + b.amount, 0)
  const awaitingPayment = bookings.filter((b) => b.status === "completed")
  const unreplied = reviews.filter((r) => !r.ownerReply)

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      {/* Q1: Am I visible? */}
      {business.isVerified ? (
        <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/10 p-4">
          <BadgeCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
          <div>
            <p className="text-[14px] font-semibold text-foreground">Verified &amp; listed</p>
            <p className="text-[12.5px] text-muted-foreground">
              You appear in the Services directory for pet owners nearby.
              {completeness.pct < 100 && ` Your profile is ${completeness.pct}% complete.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-foreground">Not yet visible to customers</p>
            <p className="text-[12.5px] text-muted-foreground">
              Your listing is hidden until Pet10x verifies your business.
            </p>
            <div className="mt-2 max-w-xs">
              <div className="h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-accent" style={{ width: `${completeness.pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>Profile {completeness.pct}% complete</span>
                <span>
                  {completeness.done} / {completeness.total}
                </span>
              </div>
            </div>
            {completeness.missing.length > 0 && (
              <button onClick={() => onOpenTab("storefront")} className="mt-2 text-[12.5px] font-semibold text-accent">
                Next: {completeness.missing.filter((m) => m !== "Pet10x verification")[0] ?? "awaiting Pet10x review"} →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Q2 + Q4 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button onClick={() => onOpenTab("bookings")} className="text-left">
          <StatTile label="New requests" value={requests.length} sub="awaiting your reply" tone={requests.length ? "warning" : "default"} />
        </button>
        <StatTile
          label="Jobs today"
          value={todayJobs.length}
          sub={
            todayJobs.length
              ? `next at ${new Date(todayJobs[0].scheduledFor!).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
              : "nothing scheduled"
          }
        />
        <button onClick={() => onOpenTab("earnings")} className="text-left">
          <StatTile label="Booked (30d)" value={`$${booked30d.toFixed(0)}`} sub={`$${earnings.netPaid.toFixed(0)} net paid out`} tone="accent" />
        </button>
        <button onClick={() => onOpenTab("reviews")} className="text-left">
          <StatTile
            label="Rating"
            value={business.ratingCount ? business.ratingAvg.toFixed(1) : "—"}
            sub={business.ratingCount ? `from ${business.ratingCount} review${business.ratingCount === 1 ? "" : "s"}` : "no reviews yet"}
            tone="success"
          />
        </button>
      </div>

      {/* Needs you now */}
      <SectionCard title="Needs you now">
        {requests.length === 0 && awaitingPayment.length === 0 && unreplied.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((b) => {
              const hrs = (Date.now() - new Date(b.createdAt).getTime()) / 3_600_000
              return (
                <Row
                  key={b.id}
                  tone={hrs > 4 ? "critical" : "warning"}
                  icon={<Inbox className="h-4 w-4" />}
                  title={`Booking request — ${b.petName ?? "pet"}, ${b.serviceName ?? "service"}`}
                  sub={`${b.customerName} · requested ${hrs < 1 ? "just now" : `${Math.floor(hrs)}h ago`}`}
                  meta={hrs > 4 ? "Overdue" : "SLA 4h"}
                  onClick={() => onOpenTab("bookings")}
                />
              )
            })}
            {awaitingPayment.map((b) => (
              <Row
                key={b.id}
                tone="warning"
                icon={<DollarSign className="h-4 w-4" />}
                title={`Completed — collect $${b.amount.toFixed(2)}`}
                sub={`${b.serviceName ?? "Service"} for ${b.customerName}`}
                meta="Mark paid"
                onClick={() => onOpenTab("bookings")}
              />
            ))}
            {unreplied.map((r) => (
              <Row
                key={r.id}
                tone="good"
                icon={<MessageSquare className="h-4 w-4" />}
                title={`New ${r.rating}★ review from ${r.authorName}`}
                sub={r.comment ?? "Reply to build trust with future customers"}
                meta="Reply"
                onClick={() => onOpenTab("reviews")}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Upcoming schedule">
        {todayJobs.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">Nothing scheduled today.</p>
        ) : (
          <div className="space-y-2">
            {todayJobs.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                <CalendarDays className="h-4 w-4 flex-shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">
                    {b.serviceName} — {b.petName}
                  </p>
                  <p className="text-[12px] text-muted-foreground">{b.customerName}</p>
                </div>
                <span className="text-[12.5px] font-semibold text-foreground">
                  {new Date(b.scheduledFor!).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {business.ratingCount > 0 && (
        <SectionCard title="Latest review">
          <div className="flex items-start gap-3">
            <Stars rating={reviews[0]?.rating ?? 0} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-foreground">{reviews[0]?.comment}</p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">— {reviews[0]?.authorName}</p>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

function Row({
  tone,
  icon,
  title,
  sub,
  meta,
  onClick,
}: {
  tone: "critical" | "warning" | "good"
  icon: React.ReactNode
  title: string
  sub: string
  meta: string
  onClick: () => void
}) {
  const dot = tone === "critical" ? "bg-destructive" : tone === "warning" ? "bg-warning" : "bg-success"
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left">
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
      <span className="flex-shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-foreground">{title}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{sub}</span>
      </span>
      <span className="flex flex-shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        {meta}
      </span>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </button>
  )
}
