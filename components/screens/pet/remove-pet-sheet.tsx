"use client"

import { Button } from "@/components/ui/button"
import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { DialogDescription, DialogLayer, DialogTitle } from "@/components/ui/dialog"
import { archivePet } from "@/lib/data"
import { ARCHIVE_REASONS, ARCHIVE_REASON_HINT, ARCHIVE_REASON_LABEL, type ArchiveReason } from "@/lib/data/pet-archive"

/**
 * Remove a pet — archive it, with a reason.
 *
 * The reason is required, not a courtesy: it decides whether the pet is
 * remembered on the owner's Profile (`passed_away`) or simply gone. So the
 * confirm button stays disabled until one is chosen, and each choice says what
 * it will do before it is tapped.
 *
 * Nothing is deleted: records other people hold about the pet — a violation,
 * an incident, a clinic's chart — keep it by name. The sheet says only what
 * changes for the owner.
 */
export function RemovePetSheet({
  petId,
  petName,
  onClose,
  onRemoved,
}: {
  petId: string
  petName: string
  onClose: () => void
  onRemoved: () => void
}) {
  const [reason, setReason] = useState<ArchiveReason | null>(null)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!reason) return
    setBusy(true)
    const { error } = await archivePet(petId, reason)
    setBusy(false)
    if (error) {
      toast.error(`Couldn't remove ${petName}`, { description: error })
      return
    }
    toast.success(reason === "passed_away" ? `${petName} is now in your In memory list` : `${petName} was removed`)
    onRemoved()
  }

  return (
    // Escape and a tap outside cancel it — never mid-removal.
    <DialogLayer
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
      described
      overlayClassName="flex items-end justify-center bg-black/40 sm:items-center"
      className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-float sm:rounded-3xl"
    >
          <DialogTitle className="text-title font-semibold leading-normal text-foreground">Remove {petName}?</DialogTitle>
          <DialogDescription className="mt-1 text-meta leading-relaxed text-muted-foreground">
            {petName} will leave your pets, and their care reminders and any records you share with a vet will stop.
          </DialogDescription>

          <div role="radiogroup" aria-label="Reason" className="mt-4 flex flex-col gap-2">
            {ARCHIVE_REASONS.map((r) => (
              <button
                key={r}
                role="radio"
                aria-checked={reason === r}
                onClick={() => setReason(r)}
                disabled={busy}
                className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                  reason === r ? "border-destructive bg-destructive-soft" : "border-border bg-card"
                }`}
              >
                <span className="block text-body font-semibold text-foreground">{ARCHIVE_REASON_LABEL[r]}</span>
                <span className="block text-caption text-muted-foreground">{ARCHIVE_REASON_HINT[r]}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy} className="flex-1">
              Cancel
            </Button>
            <Button variant="danger" onClick={confirm} disabled={!reason || busy} className="flex-1">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Remove
            </Button>
          </div>
    </DialogLayer>
  )
}
