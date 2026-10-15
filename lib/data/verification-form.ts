/**
 * What a clinic must tell Pet10x before an admin can verify it. Pure, so the
 * form and its tests share one definition. Each field says what is allowed
 * (a pattern or a length), not what is refused.
 */

export interface VerificationInput {
  licenceNumber: string
  issuingBody: string
  contactName: string
  contactPhone: string
}

export type VerificationErrors = Partial<Record<keyof VerificationInput, string>>

export type VerificationResult =
  | { ok: true; value: VerificationInput }
  | { ok: false; errors: VerificationErrors }

// Starts with a letter or digit; then letters, digits, spaces and . / -; 3-40 characters in all.
const LICENCE = /^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$/
// Digits with the usual separators and a leading +; 7-20 characters.
const PHONE = /^[+0-9 ()-]{7,20}$/

export function validateVerification(v: VerificationInput): VerificationResult {
  const value: VerificationInput = {
    licenceNumber: v.licenceNumber.trim(),
    issuingBody: v.issuingBody.trim(),
    contactName: v.contactName.trim(),
    contactPhone: v.contactPhone.trim(),
  }
  const errors: VerificationErrors = {}

  if (value.licenceNumber === "") errors.licenceNumber = "Enter your licence number."
  else if (!LICENCE.test(value.licenceNumber))
    errors.licenceNumber = "Use 3 to 40 letters, numbers, spaces, dots, slashes or dashes, starting with a letter or number."

  if (value.issuingBody === "") errors.issuingBody = "Enter who issued the licence."
  else if (value.issuingBody.length < 2 || value.issuingBody.length > 80)
    errors.issuingBody = "Use 2 to 80 characters."

  // Optional; business_resubmit_verification refuses more than 80 (20261015000003).
  if (value.contactName.length > 80) errors.contactName = "Use 80 characters or fewer."

  if (value.contactPhone !== "" && !PHONE.test(value.contactPhone))
    errors.contactPhone = "Use 7 to 20 digits, spaces, brackets, dashes or a leading +."

  return Object.keys(errors).length === 0 ? { ok: true, value } : { ok: false, errors }
}
