# Part C — trust and legal

Date: 2026-10-07. Branch: `pet10x-gaps`. Migration numbers: `20261009000001…`.

## 1. Terms, Privacy and Help pages

No `/terms`, `/privacy` or `/help` route exists; the landing footer links are
`href="#"` and the sign-in consent line is unlinked.

- New static routes `app/terms/page.tsx`, `app/privacy/page.tsx`,
  `app/help/page.tsx`, styled like the landing page (reuse `LandingNav` and the
  footer), readable on phones, with a "Last updated" date.
- **Privacy policy** is written for a Canadian service under PIPEDA (and BC
  PIPA), describing what the code actually does — derive every statement from
  the codebase, not from a generic template:
  what is collected (account, address/unit, pet health records, photos,
  incident evidence, accommodation documents, AI chat content and images),
  why, who can see it (building managers for linked buildings, vets you share
  with, businesses you book), processors (Supabase, Vercel, Resend, Groq for
  AI), retention (cite the real purge windows: AI media, incident evidence,
  accommodation documents — read the purge routes for the numbers), access /
  export (`exportMyData`) and deletion (account delete), and a contact address.
- **Terms of service**: eligibility, accounts, acceptable use, user content,
  the AI assistant is not veterinary advice and is not an emergency service,
  bylaw enforcement is the building's decision not Pet10x's, businesses and
  clinics are independent, liability limits, governing law British Columbia.
- **Help**: FAQ grouped by persona (owners, managers, businesses, clinics) on
  the flows that exist, plus the contact address.
- Contact address comes from one constant `SUPPORT_EMAIL` in a new
  `lib/site.ts`, read from `NEXT_PUBLIC_SUPPORT_EMAIL` with fallback
  `support@pet10x.com`. Add it to `.env.example`.
- Link them from: landing footer (Privacy, Terms, PIPEDA → `/privacy#pipeda`,
  Disclaimers → `/terms#disclaimers`, Contact → `mailto:`), sign-in consent
  line, business sign-up page (add the same consent line), resident Profile
  (a **Help & legal** section restoring Help, Terms, Privacy rows), manager
  Settings (replace the disabled Help & FAQ and Terms & Privacy rows with
  working links), clinic and business settings if they have a settings area.
- Middleware must allow these routes unauthenticated.
- Add a top-of-file comment in each legal page noting the text should be
  reviewed by counsel before launch (comment only, not shown to users).

## 2. Business sign-up verifies the email

`app/api/business/signup/route.ts` creates a confirmed user with no OTP and no
rate limit.

- Reuse the resident OTP machinery: migration adds `pending_signups.intent
  text not null default 'resident' check (intent in ('resident','business'))`
  and `pending_signups.business jsonb null` ({businessName, category}).
- `/api/auth/signup/start` accepts an optional `intent: 'business'` with
  `businessName`, `category`; same cooldown, send cap and code email.
- `/api/auth/signup/verify` reads the pending row; for `business` it runs the
  current business route's post-create steps (role, `businesses` insert,
  rollback on failure). Password rules use `checkPassword` for both.
- `app/businessaccess/page.tsx` becomes two steps: details → code entry (reuse
  the resident screen's code UI component if one exists).
- Delete `app/api/business/signup/route.ts`.

## 3. Admin verifies clinics and businesses by tier

`businesses.tier` (`registered|listed|verified`) gates owner search,
bookings, record sharing and emergency access, and nothing can change it.

- Migration: `public.admin_set_business_tier(p_business uuid, p_tier
  business_tier, p_note text default null) returns void`, `SECURITY DEFINER`,
  `is_admin()` only; keeps `is_verified` in sync (`true` iff tier =
  `verified`); writes `audit_log`; notifies the business owner (kind
  `system`). Revoke direct writes of `tier`/`is_verified` by non-admins if any
  policy allows it (check `businesses` update policies and the existing
  self-verification guard trigger; extend that guard to `tier`).
- Admin console Businesses tab: replace the verify toggle with a tier select
  (Registered / Listed / Verified) with a short description of what each
  unlocks, plus a filter for businesses awaiting review.
- Clinic: the "Verify to receive shared records" banner gains a **Request
  verification** button that inserts a `business_verifications` row
  (`kind='licence'`, `status='submitted'`; add an insert policy for
  `can_admin_business` if none exists). The banner then reads "Verification
  requested". The admin Businesses tab lists open requests and approving one
  sets tier to `verified` and the request to `approved` (rejecting →
  `rejected` with a note shown on the clinic banner).

## Testing
- Unit: tier description mapping, signup intent validation.
- SQL `supabase/tests/part-c.sql`: non-admin cannot set tier (RPC or direct
  update); admin can; business owner can request verification for own
  business only; pending_signups business row round-trips.
- `pnpm test`, `tsc --noEmit`, `pnpm build` green.
