"use client"

/**
 * Pet10x — read one accommodation supporting document, in place.
 *
 * A MANAGER READS THE LETTER. There is no honest way to decide an ESA request
 * without reading the provider's letter, and `accommodation-docs read` permits
 * exactly that. This component is where the permission is exercised, so it is
 * also where the confidentiality contract is stated to the person exercising
 * it — the standing line below is rendered every time, not once in a tooltip.
 *
 * THE LINE NAMES THE SUPER-ADMIN, AND IT HAS TO. It previously read "Only you,
 * other managers of this building, and the resident can see it", which was a
 * false statement about the database made by the UI. `accommodation-docs read`
 * ends in `manages_building(r.building_id) OR is_admin()`, and a super-admin who
 * manages no building and lives in none reads every submitted request's
 * documents — measured on production, 3 of 3 objects. The POLICY is correct and
 * deliberate; `docs/RBAC_CAPABILITIES.md` marks the letter allowed for
 * Super-admin in its own contract table. It was this sentence that was wrong,
 * and it was wrong in exactly the `emergency_directory` / `p.conditions` shape
 * this phase was written to avoid — a stated audience narrower than the served
 * one — restated in the UI instead of in a function body. If the enumeration
 * ever falls out of step with that policy again, change the enumeration or drop
 * it; do not leave a reassurance the database does not keep.
 *
 * Three properties, each chosen against a specific way a private document leaks:
 *
 *   1. IT DOES NOT DOWNLOAD BY DEFAULT. No `<a download>`, no `window.open`,
 *      no `Content-Disposition: attachment`. Opening a letter reads it; it does
 *      not put a copy in the manager's Downloads folder.
 *
 *      SAID EXACTLY, because an earlier version of this note overclaimed:
 *      Chrome's own embedded PDF viewer draws a toolbar with Download and
 *      Print, and that is a user-agent affordance this component cannot remove
 *      and deliberately does not try to. `#toolbar=0` would hide it — along
 *      with zoom and paging, which a manager reading a two-page letter needs —
 *      and a manager assembling a CRT filing has a legitimate reason to print.
 *      What is guaranteed here is that NOTHING IN THIS PRODUCT initiates a
 *      download; a deliberate act by the reader is a different thing.
 *   2. THE SIGNED URL NEVER REACHES THE ADDRESS BAR. It is held in state and
 *      handed to one element. A URL in `location` survives in history, in a
 *      screenshot, and in whatever syncs the browser's tabs.
 *   3. IT IS NEVER LOGGED. No console.log of the url, and no error message
 *      that embeds it.
 *
 * The URL expires in sixty seconds (`signAccommodationDoc`), which is long
 * enough to read a one-page letter and short enough that a copied link is dead
 * before it can be pasted anywhere useful.
 */

import { useCallback, useEffect, useState } from "react"
import { DialogDescription, DialogLayer, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Lock, X, FileText, CheckCircle2, XCircle } from "lucide-react"
import { signAccommodationDoc } from "@/lib/data/accommodation-docs"
import { fileSize, DOC_KIND_LABEL, type AccommodationDocumentRow } from "@/lib/data/accommodations"
import { shortDate } from "@/lib/dates"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export interface AccommodationDocumentViewerProps {
  document: AccommodationDocumentRow
  /** Absent for the resident's own view, which offers no verdict. */
  onVerdict?: (verified: boolean, note: string) => Promise<void>
  onClose: () => void
}

export function AccommodationDocumentViewer({ document, onVerdict, onClose }: AccommodationDocumentViewerProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "failed" | "purged">("loading")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const isPdf = document.mimeType === "application/pdf"

  const mint = useCallback(async () => {
    if (!document.storagePath) {
      // The row survives retention; the file does not. Say so rather than
      // showing a broken frame.
      setState("purged")
      return
    }
    setState("loading")
    const signed = await signAccommodationDoc(document.storagePath)
    if (!signed) {
      setState("failed")
      return
    }
    setUrl(signed)
    setState("ready")
  }, [document.storagePath])

  useEffect(() => {
    void mint()
  }, [mint])

  return (
    // Escape and a tap outside close it like X — not while a verdict saves.
    <DialogLayer
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
      described
      overlayClassName="flex items-end justify-center bg-black/50 sm:items-center"
      className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-card sm:rounded-2xl"
    >
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <DialogTitle className="text-title font-semibold leading-normal text-foreground break-words">
                {DOC_KIND_LABEL[document.kind]}
              </DialogTitle>
              {/* break-words on the FILENAME as well as the body. `pre-wrap`
                  wraps at spaces only, and an uploaded file can easily be named
                  one 200-character unbroken token. */}
              <DialogDescription className="mt-0.5 text-caption text-muted-foreground break-words">
                {document.label ?? "Untitled"} · {fileSize(document.sizeBytes)}
                {document.uploadedAt ? ` · uploaded ${shortDate(document.uploadedAt)}` : ""}
              </DialogDescription>
            </div>
            <Button variant="quiet" size="icon-sm" onClick={onClose} aria-label="Close document">
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>

          <div className="flex items-start gap-2 border-b border-border bg-primary-soft px-4 py-2.5">
            <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <p className="text-caption leading-relaxed text-foreground break-words">
              This document is confidential. Only this building&rsquo;s managers, the resident who filed the
              request, and a Pet10x administrator can open it.
            </p>
          </div>

          <div className="min-h-[240px] flex-1 overflow-auto bg-muted p-3">
            {state === "loading" && (
              <div className="flex h-full min-h-[200px] items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {state === "purged" && (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center">
                <FileText className="h-6 w-6 text-muted-foreground" />
                <p className="text-meta text-muted-foreground break-words">
                  The file was removed under the retention rule. The record that it was provided
                  {document.verifiedAt ? ` and verified on ${shortDate(document.verifiedAt)}` : ""} remains.
                </p>
              </div>
            )}
            {state === "failed" && (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-meta text-muted-foreground break-words">
                  That link has expired or could not be opened.
                </p>
                <Button size="sm" variant="secondary" onClick={() => void mint()}>
                  Try again
                </Button>
              </div>
            )}
            {state === "ready" && url && isPdf && (
              // `object` rather than an <a download>. The sandbox keeps script
              // and top-level navigation out of the embedded document.
              <object
                data={url}
                type="application/pdf"
                aria-label="Supporting document"
                className="h-[55dvh] w-full rounded-lg bg-background"
              >
                <p className="p-4 text-meta text-muted-foreground">
                  This browser cannot display a PDF inline.
                </p>
              </object>
            )}
            {state === "ready" && url && !isPdf && (
              // eslint-disable-next-line @next/next/no-img-element -- a signed,
              // 60-second storage URL is not a next/image loader candidate.
              <img src={url} alt="Supporting document" className="mx-auto max-h-[55dvh] w-auto rounded-lg" />
            )}
          </div>

          {onVerdict && (
            <div className="border-t border-border p-4">
              {document.verifiedAt && (
                <p className="mb-2 text-caption text-muted-foreground break-words">
                  {document.verified ? "Verified" : "Rejected"} on {shortDate(document.verifiedAt)}
                  {document.reviewNote ? ` — ${document.reviewNote}` : ""}
                </p>
              )}
              <label htmlFor="accom-doc-note" className="mb-1 block text-caption font-semibold text-muted-foreground">
                Note (the resident can read this)
              </label>
              <Textarea
                id="accom-doc-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Why this letter does or does not satisfy the requirement"
              />
              <div className="mt-2 flex gap-2">
                <Button
                  className="flex-1"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true)
                    await onVerdict(true, note)
                    setBusy(false)
                  }}
                >
                  {!busy && <CheckCircle2 className="h-3.5 w-3.5" />}
                  Verify
                </Button>
                <Button
                  className="flex-1"
                  variant="secondary"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true)
                    await onVerdict(false, note)
                    setBusy(false)
                  }}
                >
                  {!busy && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                  Reject
                </Button>
              </div>
            </div>
          )}
    </DialogLayer>
  )
}
