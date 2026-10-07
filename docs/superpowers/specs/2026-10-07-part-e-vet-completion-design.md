# Part E — vet completion

Date: 2026-10-07. Branch: `pet10x-gaps`. Migration numbers: `20261010000001…`.
Taking payment for invoices is out of scope; "paid" stays a status the clinic
records.

## 1. Owners see estimates and invoices, and approve estimates

- **Fix a leak first:** `invoices_owner_read` and `invoice_lines_owner_read`
  let owners read `draft` rows. Migration replaces both to require
  `status <> 'draft'`.
- `owner_approve_estimate` does not check `kind`; replace it so it also
  requires `kind = 'estimate'`, and after approval notifies the clinic's
  owner/manager staff (kind `clinic`) — via the same definer function.
- New owner data functions in `lib/data/owner-vets.ts`: `useMyInvoices()`
  (explicit filter to the signed-in owner's pets, newest first, with lines and
  clinic name) and `approveEstimate(id)`.
- `components/screens/my-vets-screen.tsx` gains a **Bills** view in the
  segmented tabs: estimates awaiting approval first (with **Approve
  estimate**), then invoices with status badge (Sent / Approved / Paid /
  Void), totals, line items in an expandable row. No payment button; an unpaid
  invoice says "Pay the clinic directly".
- When a clinic moves an invoice/estimate `draft → sent`
  (`clinic_set_invoice_status`), notify the pet owner (kind `clinic`,
  action target to My Vets → Bills). Replace the function from its latest
  definition, adding only the notification.
- Add navigation support for that action target in `lib/navigation.ts` (and
  its tests).

## 2. Clinic staff invite

- New route `app/api/clinic/invite/route.ts`, cloned from
  `app/api/strata/invite/route.ts`: caller must pass `can_admin_business` for
  the business (check via RPC or a query under the user's session), body
  `{businessId, email, fullName, role}` with role in
  `veterinarian|nurse|reception|manager`.
  - Existing profile: insert `business_staff` (`invited_by`, `invited_at`,
    `is_active=true`), refuse duplicates readably.
  - New user: `generateLink({type:'invite', redirectTo: origin +
    '/auth/set-password'})`, insert the staff row, send an invite email (new
    `sendClinicInviteEmail` in `lib/email.ts`, HTML-escaping interpolated
    names), return `inviteUrl` when email is suppressed (dev) so the UI can
    show copy-link, exactly as strata does.
- `components/screens/clinic/team-screen.tsx` gains **Invite staff** (sheet:
  name, email, role) for users with `capabilities().manageTeam`, and
  **Deactivate / Reactivate** per member (`updateStaff({is_active})`), never
  for the owner row.

## Testing
- Unit: invoice grouping/sorting and status labels; navigation target parsing.
- SQL `supabase/tests/part-e.sql`: owner cannot read drafts; owner can approve
  own sent estimate, not an invoice, not another owner's; staff notified.
- `pnpm test`, `tsc --noEmit`, `pnpm build` green.
