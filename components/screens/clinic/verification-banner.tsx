"use client"

import { useState } from "react"
import { Button } from "@/components/screens/shared/ui"
import { verificationBanner } from "@/lib/data/business-tier"
import { requestVerification, useLatestVerification } from "@/lib/data/clinic/verification"
import type { ClinicMembership } from "@/lib/data/clinic/context"

/**
 * "Not yet verified", and the way out of it. The practice's owner or a manager
 * can send a verification request; then the banner says it was requested, and
 * a rejection shows the admin's reason with the option to ask again. Other
 * staff see the state without the button — they cannot send one (bver_insert).
 */
export function VerificationBanner({ clinic, canRequest }: { clinic: ClinicMembership; canRequest: boolean }) {
  const latest = useLatestVerification(clinic.businessId)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const banner = verificationBanner(clinic.tier, latest.isLoading ? null : latest.data)
  if (!banner) return null

  async function request() {
    setBusy(true)
    setFailed(null)
    const { error } = await requestVerification(clinic.businessId)
    setBusy(false)
    if (error) return setFailed(error)
    latest.refetch()
  }

  const heading =
    banner.state === "requested"
      ? "Verification requested"
      : banner.state === "rejected"
        ? "Verification not approved"
        : "Not yet verified"
  const body =
    banner.state === "requested"
      ? "Pet10x is reviewing your practice. You'll be notified of the decision."
      : banner.state === "rejected"
        ? banner.note
        : "Verify to receive shared records and take Pet10x bookings."

  return (
    <div className="rounded-xl bg-warning/10 p-2.5">
      <p className="text-[11.5px] font-semibold text-warning-strong">{heading}</p>
      {body && <p className="mt-0.5 text-[11px] text-muted-foreground">{body}</p>}
      {latest.error && <p className="mt-1 text-[11px] text-destructive">Couldn&apos;t check for a verification request.</p>}
      {canRequest && banner.canRequest && !latest.isLoading && !latest.error && (
        <Button size="sm" variant="secondary" className="mt-2 w-full" busy={busy} onClick={request}>
          {banner.state === "rejected" ? "Request again" : "Request verification"}
        </Button>
      )}
      {failed && <p className="mt-1 text-[11px] text-destructive">{failed}</p>}
    </div>
  )
}
