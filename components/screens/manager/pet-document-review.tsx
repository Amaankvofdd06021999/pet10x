"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, ExternalLink, XCircle } from "lucide-react"
import { reviewPetDocument } from "@/lib/data/manager-queues"
import { canApprovePetDocument } from "@/lib/data/pet-document-review"
import { petFileSignedUrl } from "@/lib/supabase/storage"
import { localDayKey } from "@/lib/dates"
import type { DocumentReviewItem } from "@/lib/data/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * View / Approve / Reject for one pet document.
 *
 * Shared by Approvals -> Documents and the strata work queue so the two offer
 * the same verdicts on the same conditions. View and Approve exist only when a
 * file was uploaded — there is nothing to look at or vouch for otherwise.
 * Reject opens a note field first: the owner is told exactly what it says, and
 * the database refuses a rejection without one.
 */
export function PetDocumentReviewControls({
  doc,
  onDone,
}: {
  doc: Pick<DocumentReviewItem, "id" | "pet" | "type" | "storagePath" | "docStatus" | "expiresOn">
  onDone: () => void
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | "view" | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState("")

  async function view() {
    if (!doc.storagePath) return
    // Opened before the await so the browser treats it as the user's click,
    // not a popup; pointed at the signed URL once it exists.
    // ("noopener" would make window.open return null, so it is cut by hand.)
    const tab = window.open("", "_blank")
    if (tab) tab.opener = null
    setBusy("view")
    const url = await petFileSignedUrl(doc.storagePath, 300)
    setBusy(null)
    if (!url) {
      tab?.close()
      return toast.error("Couldn't open the file", { description: "It may have been removed by the owner." })
    }
    if (tab) tab.location.href = url
    else window.location.assign(url)
  }

  async function decide(verdict: "approve" | "reject") {
    setBusy(verdict)
    const { error } = await reviewPetDocument(doc.id, verdict, verdict === "reject" ? note : undefined)
    setBusy(null)
    if (error) return toast.error(verdict === "approve" ? "Couldn't approve" : "Couldn't reject", { description: error })
    toast.success(
      verdict === "approve" ? `${doc.type} approved for ${doc.pet}` : `${doc.type} rejected — the owner has been told why`,
    )
    setRejecting(false)
    setNote("")
    onDone()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {doc.storagePath && (
          <Button size="sm" variant="secondary" onClick={() => void view()} disabled={busy !== null} loading={busy === "view"}>
            {busy !== "view" && <ExternalLink className="h-3.5 w-3.5" />}
            View
          </Button>
        )}
        {canApprovePetDocument(doc, localDayKey(new Date())) && (
          <Button size="sm" onClick={() => void decide("approve")} disabled={busy !== null} loading={busy === "approve"}>
            {busy !== "approve" && <CheckCircle2 className="h-3.5 w-3.5" />}
            Approve
          </Button>
        )}
        {!rejecting && (
          <Button size="sm" variant="secondary" onClick={() => setRejecting(true)} disabled={busy !== null}>
            <XCircle className="h-3.5 w-3.5 text-destructive" /> Reject
          </Button>
        )}
      </div>
      {rejecting && (
        <div className="flex flex-col gap-1.5">
          <label className="text-caption font-semibold text-foreground" htmlFor={`reject-${doc.id}`}>
            Why? The owner reads this exactly as written.
          </label>
          <Textarea
            id={`reject-${doc.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="The licence shown expired in March — please upload the renewal."
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="danger"
              onClick={() => void decide("reject")}
              disabled={busy !== null || !note.trim()}
              loading={busy === "reject"}
            >
              Reject and tell the owner
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setRejecting(false)
                setNote("")
              }}
              disabled={busy !== null}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
