"use client"

import { useState } from "react"
import { PawPrint } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface ConsentDialogProps {
  open: boolean
  onAccept: () => Promise<boolean>
  onDecline: () => void
}

/**
 * The consent gate, shown once before first use.
 *
 * Deliberately blunt about what this is and is not. The server re-checks
 * profiles.ai_consent_at on every message, so this dialog is the explanation,
 * not the enforcement.
 */
export function ConsentDialog({ open, onAccept, onDecline }: ConsentDialogProps) {
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAccept = async () => {
    setSaving(true)
    setError(null)
    const ok = await onAccept()
    setSaving(false)
    // A save that failed is not a refusal. Keep the dialog up so the owner can
    // try again rather than bouncing them out of the assistant entirely.
    if (!ok) setError("Couldn't save that just now. Please try again.")
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDecline()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary">
            <PawPrint className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <DialogTitle className="text-left text-[19px]">Before you ask</DialogTitle>
          <DialogDescription className="text-left text-[13px] leading-relaxed">
            A quick word on what this assistant is.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-foreground">
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
            <span>
              <strong className="font-semibold">It is not a veterinarian.</strong> It gives general information and
              helps you decide when to call one. It will not diagnose your pet or tell you what to give them.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
            <span>
              <strong className="font-semibold">It reads your pet&apos;s records.</strong> Their chart, vaccinations,
              medications and care log are sent with your question so answers fit your actual animal.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
            <span>
              <strong className="font-semibold">Your conversations are private.</strong> Your building manager cannot
              see them.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-destructive" />
            <span>
              <strong className="font-semibold">In an emergency, call your vet.</strong> Do not wait for an answer
              here.
            </span>
          </li>
        </ul>

        <div className="mt-1 flex flex-col gap-2">
          {error && <p className="text-center text-[12px] text-destructive">{error}</p>}
          <Button onClick={handleAccept} disabled={isSaving} className="w-full">
            {isSaving ? "One moment…" : "I understand"}
          </Button>
          <Button variant="ghost" onClick={onDecline} disabled={isSaving} className="w-full">
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
