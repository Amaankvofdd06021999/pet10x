"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, MailQuestion, Check } from "lucide-react"
import type { ResidentLinkRow } from "@/lib/data"

/**
 * "Ask for details" — the manager's half of the completeness loop.
 *
 * The manager does not choose what to ask for. The list is derived from the
 * building's own rules by the same function the resident's card reads, so a
 * manager cannot demand something their building does not require and the two
 * views cannot disagree about what is outstanding.
 *
 * Shows when it was last sent, because the failure mode here is social: a
 * resident chased three times in a day stops reading the messages.
 */
export function RequestInfoButton({
  resident,
  missing,
  onDone,
}: {
  resident: ResidentLinkRow
  missing: string[]
  onDone?: () => void
}) {
  const [sending, setSending] = useState(false)
  const [sentAt, setSentAt] = useState<string | null>(resident.infoRequestedAt)

  const askedRecently = sentAt && Date.now() - new Date(sentAt).getTime() < 24 * 60 * 60 * 1000

  async function send() {
    setSending(true)
    try {
      const res = await fetch("/api/manager/request-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId: resident.linkId, missing }),
      })
      const json = (await res.json()) as { ok?: boolean; emailed?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        toast.error("Couldn't send", { description: json.error ?? "Please try again." })
        return
      }
      setSentAt(new Date().toISOString())
      toast.success(`Asked ${resident.residentName}`, {
        description: json.emailed ? "Sent in the app and by email." : "Sent in the app.",
      })
      onDone?.()
    } catch {
      toast.error("Couldn't send", { description: "Check your connection and try again." })
    } finally {
      setSending(false)
    }
  }

  if (missing.length === 0) {
    return (
      <span className="flex items-center gap-1 text-[12px] font-semibold text-success">
        <Check className="h-3.5 w-3.5" strokeWidth={3} /> Complete
      </span>
    )
  }

  return (
    <button
      onClick={send}
      disabled={sending}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
        askedRecently ? "bg-muted text-muted-foreground" : "bg-info/10 text-info"
      }`}
    >
      {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailQuestion className="h-3.5 w-3.5" />}
      {askedRecently ? "Ask again" : "Ask for details"}
    </button>
  )
}
