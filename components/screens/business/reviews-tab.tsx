"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useBusinessReviews, replyToReview, type ReviewItem } from "@/lib/data/bookings"
import type { MyBusiness } from "@/lib/data/business"
import { SectionCard, Spinner, EmptyState, Stars, StatTile } from "./business-ui"
import { MessageSquare, Loader2, CornerDownRight } from "lucide-react"

export function ReviewsTab({ business }: { business: MyBusiness }) {
  const { data: reviews, isLoading, refetch } = useBusinessReviews(business.id)
  const unreplied = reviews.filter((r) => !r.ownerReply).length

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Rating" value={business.ratingCount ? business.ratingAvg.toFixed(1) : "—"} sub="average" tone="success" />
        <StatTile label="Reviews" value={business.ratingCount} sub="total" />
        <StatTile label="Awaiting reply" value={unreplied} sub="replying builds trust" tone={unreplied ? "warning" : "default"} />
      </div>

      {reviews.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-8 w-8" />}
          title="No reviews yet"
          sub="Customers can review you once a booking is completed."
        />
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} onReplied={refetch} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReviewCard({ review, onReplied }: { review: ReviewItem; onReplied: () => void }) {
  const [replying, setReplying] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!text.trim()) return toast.error("Write a reply first.")
    setBusy(true)
    const { error } = await replyToReview(review.id, text.trim())
    setBusy(false)
    if (error) return toast.error("Couldn't reply", { description: error })
    toast.success("Reply posted")
    setReplying(false)
    setText("")
    onReplied()
  }

  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Stars rating={review.rating} />
            <span className="text-[13.5px] font-semibold text-foreground">{review.authorName}</span>
          </div>
          {review.comment && <p className="mt-1 text-[13px] text-foreground">{review.comment}</p>}
        </div>
        <span className="flex-shrink-0 text-[11.5px] text-muted-foreground">
          {new Date(review.createdAt).toLocaleDateString()}
        </span>
      </div>

      {review.ownerReply ? (
        <div className="mt-3 flex gap-2 rounded-lg bg-muted/60 p-3">
          <CornerDownRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
          <div>
            <p className="text-[12.5px] text-foreground">{review.ownerReply}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Your reply{review.repliedAt ? ` · ${new Date(review.repliedAt).toLocaleDateString()}` : ""}
            </p>
          </div>
        </div>
      ) : replying ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Thank them, or address the issue publicly…"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex gap-2">
            <button
              onClick={send}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Post reply
            </button>
            <button onClick={() => setReplying(false)} className="rounded-lg bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-foreground">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setReplying(true)} className="mt-3 text-[12.5px] font-semibold text-accent">
          Reply to this review →
        </button>
      )}
    </SectionCard>
  )
}
