# UX Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the five follow-ups left after the 2026-10-14 UX release: raw database text on screens, manager notification targets, Earnings totals, clinic partial payments and voids, and toasts inside dialogs.

**Architecture:** One unapplied migration (`20261016000001_followups.sql`) plus SQL checks in `supabase/tests/part-h.sql`, bundled by `supabase/bundles/build.sh` (cutoff moves to `20261016`; checks run part-a…part-h). App changes keep decision logic in pure tested modules under `lib/`.

**Tech Stack:** Next.js 16, React 19, Supabase, vitest (Node), pnpm 9.15.9.

**Spec:** The follow-up list in the 2026-10-14 release summary, and the "minor (deferred)" lines in `.superpowers/sdd/2026-10-14-ux-required-fixes/progress.md`.

## Global Constraints

- Same constraints as `docs/superpowers/plans/2026-10-14-ux-required-fixes.md` (pnpm PATH, gates, positive grammar, ConfirmDialog only, never touch the live DB outside the bundle flow, copy rules).
- Migrations `20261015000001…000006` are APPLIED in production — never edit them. New SQL goes only in `20261016000001_followups.sql`.
- Copy every function you redefine from its LIVE definition (`.superpowers/sdd/2026-10-14-ux-followups/live-defs.md`), changing only what the task says.
- Permission checks in new SQL must be NULL-safe (`not coalesce(x, false)` or EXISTS-based helpers).
- No raw database or Supabase error text reaches a user. Map to a plain sentence; log the detail with `console.error`.

## Review Focus

1. A partial payment followed by a second payment that exceeds the remaining balance: refused or capped, never paid_cents > total_cents.
2. Voiding a paid invoice: reason required, the owner's bill shows "Void", Taken today no longer counts it.
3. An error mapper given an unknown error must return the fallback, never the raw message.
4. Old notifications already stored with target `approvals` still open Approvals (default tab).
5. Earnings: the three money tiles reconcile on the same set of bookings.

---

### Task 1: Migration — notification targets, invoice payments, voids

**Files:** Create `supabase/migrations/20261016000001_followups.sql`, `supabase/tests/part-h.sql`; modify `supabase/bundles/build.sh` (cutoff `20261016`, add `part-h`); `lib/supabase/database.types.ts` (new table + RPCs by hand); regenerate bundles.

- [ ] **Targets.** Copy LIVE `request_building_link` and change its notification target from `approvals` to `residents` (resident link requests are decided on the Residents screen). Copy LIVE `submit_accommodation_request` and `withdraw_accommodation_request` and change `approvals` to `approvals:accommodations`. Grep all migrations for any other function that writes `action_target` `'approvals'` and is live (verify with live-defs); treat each the same way (registrations → `approvals:registrations`, documents → `approvals:documents`, incidents → `approvals:incidents`).
- [ ] **Payments.** Table `public.invoice_payments (id uuid pk default gen_random_uuid(), invoice_id uuid not null references invoices on delete cascade, business_id uuid not null, amount_cents integer not null check (amount_cents > 0), method text not null check (method in ('cash','card','e_transfer','other')), recorded_by uuid references profiles on delete set null, created_at timestamptz not null default now())`; RLS on; select for `staff_of_business(business_id) or is_admin()` and for the pet's owner (join invoices→clinic_patients→pets.owner_id = auth.uid()); no client insert/update/delete policies.
- [ ] `clinic_record_payment(p_invoice uuid, p_amount_cents integer, p_method text) returns jsonb`, definer, `set search_path = public, pg_temp`: staff_of_business or admin else `{ok:false,error:'forbidden'}`; kind must be `invoice` (estimates never take payments → `not_an_invoice`); status must be `sent` or `approved` (`not_payable`); method in the allow-list (22023); amount > 0 and ≤ `total_cents - paid_cents` (`over_balance`, with `remaining`); inserts the payment row; adds to paid_cents; when paid_cents = total_cents sets status `paid`; audit_log; returns `{ok, paid_cents, remaining, status}`.
- [ ] `clinic_void_invoice(p_invoice uuid, p_reason text) returns jsonb`: staff_of_business or admin; reason required (regexp-trimmed, ≤2000; 22023); allowed from `draft|sent|approved|paid` (positive list) → `void`; appends `Voided: <reason>` to invoices.note; if it had reached the owner (status was sent/approved/paid) notify the pet's owner (kind 'clinic', severity 'warning', 'Invoice voided — {clinic}', target `my-vets:bills`); audit_log. Payments stay recorded (refunds happen outside the app).
- [ ] Copy LIVE `clinic_set_invoice_status` and remove `paid` and `void` from its allowed targets (those moves now go only through the two RPCs); keep draft→sent (and its notification), sent→draft, sent→approved.
- [ ] part-h.sql (house style of part-g): targets written correctly by each changed writer; partial payment keeps status sent and records a row; a second payment over the balance → over_balance; exact remaining payment → paid; payment on an estimate → not_an_invoice; stranger → forbidden; void paid with reason → void + owner notified; void without reason → 22023; clinic_set_invoice_status to paid now illegal_transition; owner can read their invoice's payments, a stranger can't.

### Task 2: Clinic billing and owner bills for partial payments and voids

**Files:** `lib/data/clinic/shop.ts`, `lib/data/clinic/billing.ts` (+test), `components/screens/clinic/billing-screen.tsx`, `lib/data/owner-bills.ts` (+test), `components/screens/my-vets-screen.tsx`.

- [ ] `recordPayment(invoiceId, amountCents, method)` and `voidInvoice(invoiceId, reason)` wrappers; errors mapped via a pure tested map (over_balance → "That's more than the {remaining} still owed.", not_payable, not_an_invoice, forbidden, unknown → "Couldn't save that. Try again.").
- [ ] Record payment sheet: amount defaults to the remaining balance; shows "{paid} of {total} paid · {remaining} left"; method chips Cash / Card / E-transfer / Other. No "partial closes the invoice" warning any more.
- [ ] Invoice detail lists payments (date, method, amount). Void available on draft/sent/approved/paid with a ConfirmDialog requiring a reason ("The owner sees this if they already have the bill").
- [ ] Status labels: a sent/approved invoice with 0 < paid < total shows "Partly paid". `invoiceActions` updated and tested.
- [ ] Taken today sums today's `invoice_payments` (created_at in the practice timezone), not updated_at. Pure helper + test.
- [ ] Owner bills: "Partly paid — {paid} of {total}" and "Void" labels; tests.

### Task 3: Manager notification targets in the app, Earnings, toasts in dialogs

**Files:** `lib/navigation.ts` (+test), `components/screens/business/earnings-tab.tsx`, `components/screens/business/dashboard-tab.tsx`, `lib/data/fees.ts` (+test), the `<Toaster>` mounts (`app/app/page.tsx`, `app/clinic/page.tsx`, `app/report/page.tsx`, others — grep).

- [ ] `residents` resolves as a manager target with no id; `approvals:<tab>` already resolves; tests for `residents`, `approvals:accommodations`, legacy bare `approvals`.
- [ ] Earnings: one pure `earningsSummary(bookings)` used by every money tile: Gross collected, Pet10x fee, Net to you all over the SAME set (completed + paid), with "Waiting for payment" (completed, not paid) as its own line, so Gross − Fee = Net exactly. Dashboard's "earned after Pet10x fee" uses the same function. Tests including a mix of statuses.
- [ ] Toasts inside dialogs: render the app's `<Toaster>` through a portal attached directly to `document.body` *after* dialog portals are created? — Radix `hideOthers` hides body children except the dialog. Use Sonner's own live region strategy: mount the Toaster in a portal and mark it so Radix doesn't hide it — implement by rendering Toaster inside a `<div data-radix-toast-viewport>`? Ruling: verify the actual Radix `hideOthers` behaviour in node_modules (`aria-hidden` package: it skips elements with `aria-live`? check) and choose the minimal working approach; document it in a code comment; add a test only if logic is pure.

### Task 4: No raw database text on any screen

**Files:** create `lib/data/db-error.ts` (+test); modify every `lib/data/**/*.ts` and `app/api/**/route.ts` that returns or responds with `error.message` / `error?.message` (≈135 sites in 35 files); components that pass raw strings into toasts.

- [ ] `dbErrorMessage(error: unknown, fallback: string): string` — returns a mapped sentence only for an allow-list of known Postgres/Supabase codes and our own RPC error codes (`42501` → "You don't have access to that.", `23505` → "That already exists.", `22023` → keeps OUR raised message only when it is in the allow-list of sentences we wrote — reuse `lib/user-error.ts`'s set), else `fallback`; always `console.error`s the original. Tests: unknown error → fallback; raw constraint text → fallback; our sentence → itself.
- [ ] Replace each raw `error.message` return/response with `dbErrorMessage(error, "<specific plain fallback for that action>")` (e.g. "Couldn't save the service. Try again."). API routes respond with the mapped sentence and log the detail.
- [ ] Grep proof in the report: no `error.message` reaches a return value or response body in lib/data or app/api (allowed only inside console.error / logging).
