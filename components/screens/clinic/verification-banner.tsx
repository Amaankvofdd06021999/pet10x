"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { verificationBanner } from "@/lib/data/business-tier"
import { requestVerification, resubmitVerification, useLatestVerification, type VerificationRequest } from "@/lib/data/clinic/verification"
import { validateVerification, type VerificationErrors, type VerificationInput } from "@/lib/data/verification-form"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import { ErrorText } from "@/components/ui/error-text"

/**
 * "Not yet verified", and the way out of it. The practice's owner or a manager
 * can send a verification request with their licence details; then the banner
 * says it was requested, a request for more information or a rejection shows
 * the admin's words, and after a rejection the form opens prefilled from the
 * last request, and so does answering a request for more information
 * ("Update and resubmit" reuses the same request). Other staff see the state without the button — they cannot
 * send one (bver_insert).
 */
export function VerificationBanner({ clinic, canRequest }: { clinic: ClinicMembership; canRequest: boolean }) {
  const latest = useLatestVerification(clinic.businessId)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [errors, setErrors] = useState<VerificationErrors>({})
  const [form, setForm] = useState<VerificationInput>({ licenceNumber: "", issuingBody: "", contactName: "", contactPhone: "" })

  const banner = verificationBanner(clinic.tier, latest.isLoading ? null : latest.data)
  if (!banner) return null

  function openForm(previous: VerificationRequest | null) {
    setForm({
      licenceNumber: previous?.licenceNumber ?? "",
      issuingBody: previous?.issuingBody ?? "",
      contactName: previous?.contactName ?? "",
      contactPhone: previous?.contactPhone ?? "",
    })
    setErrors({})
    setFailed(null)
    setOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const checked = validateVerification(form)
    if (!checked.ok) return setErrors(checked.errors)
    setErrors({})
    setBusy(true)
    setFailed(null)
    // A question from Pet10x is answered on the same request.
    const { error } =
      banner?.state === "needs_info" && latest.data
        ? await resubmitVerification(latest.data.id, checked.value)
        : await requestVerification(clinic.businessId, checked.value)
    setBusy(false)
    if (error) return setFailed(error)
    setOpen(false)
    latest.refetch()
  }

  const heading =
    banner.state === "requested"
      ? "Verification requested"
      : banner.state === "needs_info"
        ? "Pet10x needs more information"
        : banner.state === "rejected"
          ? "Verification not approved"
          : "Not yet verified"
  const body =
    banner.state === "requested"
      ? "Pet10x is reviewing your practice. You'll be notified of the decision."
      : banner.state === "needs_info" || banner.state === "rejected"
        ? banner.note
        : "Verify to receive shared records and take Pet10x bookings."
  const set = (k: keyof VerificationInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="rounded-xl bg-warning-soft p-2.5">
      <p className="text-caption font-semibold text-foreground">{heading}</p>
      {body && <p className="mt-0.5 text-caption text-muted-foreground">{body}</p>}
      {latest.error && <ErrorText className="mt-1 text-caption">Couldn&apos;t check for a verification request.</ErrorText>}
      {canRequest && banner.canRequest && !latest.isLoading && !latest.error && !open && (
        <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => openForm(latest.data)}>
          {banner.state === "rejected" ? "Request again" : banner.state === "needs_info" ? "Update and resubmit" : "Request verification"}
        </Button>
      )}
      {open && (
        <form onSubmit={submit} noValidate className="mt-2 flex flex-col gap-2">
          <Field label="Licence number" required error={errors.licenceNumber}>
            {(p) => <Input {...p} value={form.licenceNumber} onChange={set("licenceNumber")} autoComplete="off" />}
          </Field>
          <Field label="Issuing body" required error={errors.issuingBody} hint="Who issued the licence, for example your provincial college.">
            {(p) => <Input {...p} value={form.issuingBody} onChange={set("issuingBody")} autoComplete="off" />}
          </Field>
          <Field label="Contact name" error={errors.contactName}>
            {(p) => <Input {...p} value={form.contactName} onChange={set("contactName")} autoComplete="name" />}
          </Field>
          <Field label="Contact phone" error={errors.contactPhone}>
            {(p) => <Input {...p} type="tel" value={form.contactPhone} onChange={set("contactPhone")} autoComplete="tel" />}
          </Field>
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" className="flex-1" loading={busy}>
              {banner.state === "needs_info" ? "Resubmit" : "Send request"}
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {failed && (
        <ErrorText className="mt-1 text-caption">{failed}</ErrorText>
      )}
    </div>
  )
}
