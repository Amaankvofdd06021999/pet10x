# Task 1 report — migration: notification targets, invoice payments, voids

Status: DONE_WITH_CONCERNS (the SQL has never been run; see Concerns)
Commit: bb70635 "Clinic bills take payment in parts and void with a reason; manager notices open the screen that decides them"

## What was built

`supabase/migrations/20261016000001_followups.sql`. The header follows house style: why, what, and what it leaves alone.

1. **Targets.** Each function is copied from its LIVE definition and only the target changes:
   - `request_building_link`: `approvals` becomes `residents`. The body now reads "…waiting for review in Residents." The label stays "Review request" and search_path stays `public`, as it is live.
   - `submit_accommodation_request` and `withdraw_accommodation_request`: `approvals` becomes `approvals:accommodations`. The label stays "Open approvals". I copied both from 20260829000001 and checked them against the features live-defs lists. A diff against that file shows only the target strings, the comments and the function comment.
   - No other live function writes `'approvals'` (live-defs confirms this; the grep matches only these three).
2. **`public.invoice_payments`**, built to the brief's spec. I added an FK on `business_id` to businesses (cascade), matching invoice_lines. It has indexes on (invoice_id, created_at) and (business_id, created_at desc). RLS is on, with two select policies:
   - `invoice_payments_staff_read`: `staff_of_business(business_id) or is_admin()`.
   - `invoice_payments_owner_read`: invoices → clinic_patients → pets.owner_id = auth.uid(), with `i.status <> 'draft'` like invoices_owner_read.

   There are no insert, update or delete policies. Grants: all revoked from anon. Insert, update, delete, truncate, references and trigger are revoked from authenticated, and select is granted.
3. **`clinic_record_payment(uuid, integer, text) → jsonb`**: definer, `search_path = public, pg_temp`. Checks run in this order:
   - Locks the invoice FOR UPDATE; a missing invoice gives not_found.
   - NULL-safe permission check: `not (coalesce(staff_of_business, false) or coalesce(is_admin(), false))` gives forbidden.
   - kind must be `invoice`, else not_an_invoice.
   - status must be `sent` or `approved`, else not_payable.
   - method outside cash, card, e_transfer, other (null included) raises 22023.
   - amount ≤ 0 or null raises 22023.
   - an amount over `greatest(total - paid, 0)` gives `{ok:false, error:'over_balance', remaining}`.

   If all pass, it inserts the payment row and adds to paid_cents. Status becomes `paid` when paid ≥ total, which is now the only way a bill becomes paid. It writes audit row `invoice.payment_recorded`, sends no notification, and returns `{ok, paid_cents, remaining, status}`.
4. **`clinic_void_invoice(uuid, text) → jsonb`**: same attributes. Checks run in this order:
   - Lock, then not_found.
   - forbidden (NULL-safe).
   - The reason goes through the house regexp trim; empty or over 2000 characters raises 22023.
   - Status must be in the positive list draft, sent, approved, paid, else not_voidable.

   It then sets `void` and appends `Voided: <reason>` with `concat_ws(E'\n\n', …)`, keeping the existing note. If the old status was sent, approved or paid, it notifies the pet's owner: kind clinic, severity warning, target `my-vets:bills`. Payment rows are kept. It writes audit row `invoice.voided` and returns `{ok, status, owner_notified}`.
5. **`clinic_set_invoice_status`**: copied from LIVE. The transition table is now draft→sent and sent→approved|draft. The draft→sent notification is unchanged. I removed the paid_cents assignment, because only `paid` used it. The signature is unchanged, so existing grants stand, and p_paid_cents is accepted and ignored. Two small additions: `if not coalesce(ok, false)` (a null p_status used to hit a NOT NULL error) and a function comment.

Grants: `revoke all … from public, anon; grant execute … to authenticated` for both new RPCs. The three `create or replace` redefinitions keep their existing ACLs.

`supabase/tests/part-h.sql`: copies part-g's structure — header, one transaction ending in `rollback;`, the same fixture queries for MCR2026, its manager, the owner and the outsider. It uses `set local role authenticated` with jwt.claims, and `reset role` plus cleared claims before each connection-role block. Messages use FAIL:/FIXTURE: and `ok:` notices.
- Planted fixtures: an ESA draft request with an attached esa_letter document for the outsider; Part H Clinic (owner), Part H Rex (outsider's pet), a customer and patient; invoices PH-A (sent, 10000), PH-B (sent, 5000), PH-D (draft, 3000) and estimate PH-E (sent, 8000).
- The manager doubles as the stranger to the clinic. Every count is filtered by a fixture actor or entity.
- Covers every item in the brief's part-h list, plus:
  - a null method, amount 0, and paying a draft or a paid bill (not_payable);
  - a direct insert by staff (42501);
  - a 2001-character void reason, and voiding a void bill (not_voidable);
  - sent→void and approved→paid are illegal_transition;
  - a draft's void notifies nobody;
  - payments are silent (exactly 1 my-vets:bills notice to the owner);
  - payment rows survive the void;
  - audit rows.

`supabase/bundles/build.sh`: the cutoff is now `20261016`, part-h is added after part-g, and the header text says branch `ux-followups` and "from 20261016000001". I rebuilt the bundles: `migrations: 1`. dry-run.sql has the migration followed by checks part-a-archive, b, c, e, d, f, g, h. apply.sql records version 20261016000001.

`lib/supabase/database.types.ts`: added `invoice_payments` (Row, Insert, Update, Relationships, including the user_entitlements FK twin as invoices has), `clinic_record_payment`, and `clinic_void_invoice`.

## Change outside the brief: supabase/tests/part-e.sql

part-e §3 called `clinic_set_invoice_status(part_e.inv, 'paid')` and asserted ok. After this migration that call returns illegal_transition, so **the dry run would fail at part-e**. I changed that one call to `'approved'`. sent→approved is still legal, and it is still "a move that is not draft→sent", which is all that assertion was there to prove: it notifies nobody. The fixture invoice totals 0, so clinic_record_payment couldn't stand in. No other check in part-a…g touches the changed behaviour: part-b uses request_building_link only for invalid_code, and nothing counts `approvals` targets.

## Verification

I could not run any SQL (no database, as instructed). Instead:
- **Syntax:** I parsed with libpg_query (pglast 8.3 in a scratchpad venv; nothing touched the repo or the DB).
  - Every statement in the migration (27), part-h (29), part-e, dry-run.sql (400) and apply.sql parses.
  - Every plpgsql body parses except submit_accommodation_request's. It reports `variable "v_missing" has pseudo-type _record`, which is an offline artefact: the parser can't resolve `public.doc_kind[]`. The applied original, 20260829000001, gives the identical error, and the body is verbatim.
- **Bundle markers:** dry-run.sql has one `begin;` and no bare `rollback;`, with 8 savepoint/rollback-to pairs. apply.sql has `begin;` and `commit;`.
- `npx tsc --noEmit -p .` exits 0.
- `pnpm test`: 77 files, 1033 tests passed.
- `pnpm lint`: 0 errors, 133 warnings (already there).
- No RED/GREEN cycle: this task adds no lib/ logic, only SQL and hand-written types.

## App calls Task 2 must switch (I did not change them)

- `components/screens/clinic/billing-screen.tsx:306`: `setInvoiceStatus(r.bill.id, "paid", r.paidCents, r.method)` must become clinic_record_payment.
- `components/screens/clinic/billing-screen.tsx:328`: `setInvoiceStatus(bill.id, "void")` must become clinic_void_invoice with a reason.
- `lib/data/clinic/shop.ts:242-263`: `setInvoiceStatus` passes `p_paid_cents` and then appends "Paid by {method}." to invoices.note through a direct update. Both lose their purpose; the method now lives in invoice_payments.
- `lib/data/clinic/billing.ts:6-8`: the doc comment describing the old transition table. `invoiceActions`, lines 57-64, offers "void" and "record_payment" by status. The status set still matches: void from draft, sent, approved; record_payment on sent or approved invoices.
- `billing-screen.tsx:92`: `setInvoiceStatus(bill.id, "sent")` stays valid.

Also for Task 2: a void of a `paid` bill is now allowed, but `invoiceActions` currently offers no void on a paid invoice (check lines 63-66). Review focus 2 expects one.

## Concerns

1. **Never executed.** The controller should run the SQL Editor dry run (bundles/dry-run.sql) before apply. Success is the error "DRY RUN OK — …".
2. **invoices_staff** (20260901000006, `for all`) still lets staff update `status` and `paid_cents` directly from a client. That bypasses both RPCs and could make paid_cents disagree with invoice_payments. The brief did not ask me to close it, and the app's note write uses it today. It is named in the header under what this does not touch. A later guard trigger, like service_bookings_update_guard, would close it.
3. **Void title wording.** The brief says 'Invoice voided — {clinic}'. Estimates can be voided too (draft, sent, approved), so the title, body and label depend on the kind: "Estimate voided — …" and "View estimate" for an estimate, matching the draft→sent notice. Invoices get exactly the brief's title.
   - Body: "{clinic} voided the invoice for {pet} ({amount} CAD)."
   - If anything was paid, it adds " Talk to the clinic about anything you already paid."
   - It ends with " Reason: {reason, first 200 characters}". The reason is already visible to the owner in invoices.note.
4. If invoice_lines are edited after a payment, the totals trigger can push total_cents below paid_cents. Remaining is clamped to 0, so no further payment is accepted, but nothing marks the bill paid. Pre-existing, and out of scope.
5. The owner-read policy on invoice_payments relies on the pet owner being able to read clinic_patients through RLS. That is the same path invoices_owner_read already uses in production.

## Files changed
- /Users/amaan/Documents/Apps - Pixeltec/Pet10x/Pet10x Latest/pet10x-main/supabase/migrations/20261016000001_followups.sql (new)
- /Users/amaan/Documents/Apps - Pixeltec/Pet10x/Pet10x Latest/pet10x-main/supabase/tests/part-h.sql (new)
- /Users/amaan/Documents/Apps - Pixeltec/Pet10x/Pet10x Latest/pet10x-main/supabase/tests/part-e.sql (one call, see above)
- /Users/amaan/Documents/Apps - Pixeltec/Pet10x/Pet10x Latest/pet10x-main/supabase/bundles/build.sh, dry-run.sql, apply.sql
- /Users/amaan/Documents/Apps - Pixeltec/Pet10x/Pet10x Latest/pet10x-main/lib/supabase/database.types.ts

---

# Fix round 1 (review findings + controller ruling)

## Changes to 20261016000001_followups.sql
- **New section 6, `invoices_client_guard`.** A BEFORE INSERT OR UPDATE trigger on public.invoices (`trg_invoices_client_guard`), built like service_bookings_update_guard: security invoker, `search_path = ''`, and a `current_user not in ('authenticated','anon')` test so definer code and the connection role pass.
  - Definer code includes clinic_set_invoice_status, clinic_record_payment, clinic_void_invoice, owner_approve_estimate and owner_decline_estimate (all checked to be security definer), and invoice_recalc (definer, 20260901000006).
  - For client roles, an UPDATE that changes any of (status, paid_cents, subtotal_cents, tax_cents, total_cents) raises 42501.
  - For client roles, an INSERT must be status 'draft' with paid_cents, subtotal_cents, tax_cents and total_cents all 0, else 42501.
  - The app's insert, invoiceFromVisit (shop.ts:208), sends `status: "draft"` and leaves every money column to its default of 0, so it keeps working. Its lines then set the total through invoice_recalc.
  - shop.ts:261's note-only update keeps working.
  - Execute is revoked from public, anon and authenticated. The header gains item 6, and the "closing the direct path is a separate change" note is replaced.
  - The ruling's column list did not include owner_approved_at, so it is still client-writable. Flagging it in case it should be added.
- **clinic_record_payment settles a bill with nothing owed.** If p_amount_cents = 0 and remaining = 0 (total ≤ paid, e.g. a $0 bill), it sets status 'paid', writes no payment row, writes audit `invoice.payment_recorded` with `settled_nothing_owed: true`, and returns `{ok, paid_cents, remaining: 0, status: 'paid'}`.
  - Any other 0, null or negative amount is still 22023.
  - The method is still validated first, so the app must still send one.
  - Documented in the header item 3 and in the function comment.

## part-h additions
- **New fixtures:**
  - PH-C: approved, 2000.
  - PH-S: sent, 2500, unpaid.
  - PH-Z: sent, 0.
  - PH-R: draft, 1500, with a payment row planted as the connection role, only to probe the owner-read policy.
- **§4b:**
  - Paying the approved PH-C works and marks it paid.
  - PH-Z settled with amount 0 is paid with no payment row.
  - 0 against PH-B's $50 balance is 22023.
- **§4c, as staff:**
  - Direct updates of status, paid_cents and total_cents are each 42501.
  - A note-only update on PH-C succeeds (FOUND).
  - A client insert with status 'paid' is 42501, and a draft insert carrying total_cents 9999 is 42501.
  - A plain draft insert succeeds, and inserting one line makes its total 7500, which proves invoice_recalc passes the guard.
- **§6:** voiding the sent, unpaid PH-S works and notifies the owner.
- **§7:**
  - Staff read 1 payment on draft PH-R; the pet owner reads 0.
- **§8:**
  - PH-C is paid with paid_cents 2000, its note is set, and it has one card payment row.
  - PH-Z is paid with paid_cents 0 and no payment rows.
  - PH-S is void with note 'Voided: Duplicate bill'.
  - The owner's PH-S notice body is exactly "Part H Clinic voided the invoice for Part H Rex (25.00 CAD). Reason: Duplicate bill", with no "already paid" sentence.
  - The owner has 2 my-vets:bills notices in total.
  - There are 2 payment audit rows for PH-C and PH-Z, and 3 void audit rows.

## Verification
- **Bundles rebuilt:** `migrations: 1`. dry-run.sql has one `begin;` and 8 savepoint pairs.
- **pglast parse:**
  - All 32 migration statements, 31 part-h statements and 407 dry-run statements parse.
  - All part-h plpgsql bodies parse.
  - Two migration bodies hit the offline parser's known artefacts:
    - submit_accommodation_request's doc_kind[] array, the same as before.
    - Every trigger function's JSON output. The applied service_bookings_update_guard fails identically, so this is a libpg_query JSON bug, not a syntax error.
- **Gates:**
  - `npx tsc --noEmit -p .` exits 0.
  - `pnpm test`: 77 files, 1033 tests passed.
  - `pnpm lint`: 0 errors.
- Still never executed against a database. The dry run remains the real check.
