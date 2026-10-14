# Resume here

Updated 2026-10-14: migrations applied to production; code not yet deployed. Read this first; it is the whole handover.
The previous version (paused 2026-08-21, Phases 0–8) is in git history.

## Where things stand

Branch **`pet10x-gaps`** carries the six gap-closing parts, A–F, on top of
the Phase 0–8 work. Nothing on it is pushed. Each part had a spec in
`docs/superpowers/specs/2026-10-07-part-*-design.md`, the research it was
written from in `docs/superpowers/research/`, and the rules every builder
followed in `docs/superpowers/research/builder-rules.md`.

Green on the branch: `pnpm test` (vitest), `npx tsc --noEmit -p .`,
`pnpm build`, and — new in Part F — `pnpm lint` (0 errors; warnings listed
under "Lint" below).

## What shipped, by part

| Part | What | Spec |
| --- | --- | --- |
| A | Quick fixes; pets are archived (`owner_archive_pet`), never deleted, with a reason; every current-pets read filters `deleted_at` | `part-a-quick-fixes` |
| B | Manager tools: fines settle in the case view through `manager_set_fine_status` (forward only); city reports as an area summary; pet-document review; building archive instead of delete; municipality picker | `part-b-manager-tools` |
| C | Trust & legal: `/terms`, `/privacy`, `/help`; admin business tiers and verification requests; business signup through the OTP gate | `part-c-trust-legal` |
| D | Notifications that reach people: incident and booking notifications, email (Resend) and web push, a dispatcher cron every 5 minutes, the Email & push sheet | `part-d-notifications` |
| E | Vet completion: owner bills and estimate approval, clinic staff invites, the staff guard | `part-e-vet-completion` |
| F | Admin Overview and Users; manager Audit Log, Staff & Access, Compliance Report; account deletion for everyone; ESLint; the extras below | `part-f-admin-settings` |

Part F's extras, decided by the lead: deleting an AI conversation deletes its
messages and title; customers cancel bookings only through
`customer_cancel_booking` (the business is notified) and can no longer rewrite
a booking; the business and clinic consoles have a notifications inbox; the
strata portal's Team tab opens the Email & push sheet.

## Migrations — APPLIED to production 2026-10-14

All 29 below were applied in one transaction with `supabase/bundles/apply.sql`
(pasted into the Supabase SQL Editor) after `dry-run.sql` passed, and are
recorded in `supabase_migrations.schema_migrations`. The dry run also ran every
`supabase/tests/part-*.sql` check against live data: all pass. Steps 1–2 of the
deploy order below are done; **the code on this branch is not yet deployed.**

```
20261007000001_owner_archive_pet.sql            Part A
20261007000002_pet_archive_guard_and_publish.sql
20261008000001_manager_set_fine_status.sql      Part B
20261008000002_manager_municipal_reports.sql
20261008000003_manager_review_pet_document.sql
20261008000004_building_archive.sql
20261008000005_municipal_area_summary.sql
20261008000006_pet_documents_verdict_guard.sql
20261008000007_building_archive_followups.sql
20261009000001_pending_signup_intent.sql        Part C
20261009000002_admin_business_tier.sql
20261009000003_part_c_review_fixes.sql
20261010000001_owner_bills.sql                  Part E
20261010000002_business_staff_guard.sql
20261011000001_notify_incidents_and_bookings.sql Part D
20261011000002_notification_delivery.sql
20261011000003_reminder_rules_no_sms.sql
20261011000004_reminder_rules_sms_trigger.sql
20261011000005_notification_email_failed.sql
20261012000001_account_deletion_set_null.sql    Part F
20261012000002_admin_users_and_stats.sql
20261012000003_ai_conversation_delete_purges.sql
20261012000004_customer_cancel_booking.sql
20261012000005_estimate_approved_target.sql
20261012000006_user_flags_one_door.sql
20261012000007_anonymous_incident_audit.sql
20261012000008_booking_insert_guard.sql
20261012000009_booking_status_notify_former_customer.sql
20261014000001_pet_child_tables_manager_read_only.sql  found by the dry run
```

`20261014000001`: eleven pet-record tables (`pet_documents`,
`pet_vaccinations`, `care_entries`, …) had one `for all` policy whose USING
admitted managers and whose WITH CHECK did not — and DELETE consults only
USING, so a manager could delete a resident's records. Each is now four
policies: select owner|manager|admin; insert/update/delete owner|admin.

The Supabase CLI (2.121.0) is installed at `~/.local/bin/supabase` but not
logged in. Do NOT use `supabase db push` here: local history drifts from
production (`2026-08-23-migration-drift.md`). Use `bundles/build.sh` and the
SQL Editor, or `supabase db query -f` once logged in.

## Deploy order

1. **Apply every migration above, in filename order**, to the production
   database.
2. Run `supabase/tests/part-*.sql` (below); each must end in ROLLBACK with
   only `ok:` notices.
3. Set any missing environment variables (below).
4. **Only then deploy this branch's code.**

The code calls RPCs and columns these migrations create
(`admin_list_users`, `admin_set_user_flags`, `customer_cancel_booking`,
`notify_email`, …) and no longer writes the paths they close — the admin
console's suspend button, a customer's Cancel, the Audit Log and the console
inboxes all fail against an unmigrated database. Migrations first is the
right order, but it opens a short gap for the code still deployed: its
customer Cancel (a direct UPDATE, policy dropped by `20261012000004`) and its
admin suspend button (a direct profile PATCH, refused by `20261012000006`)
fail until the new code is live. Keep the gap between steps 1 and 4 short.

`20261012000003` deletes the messages of every AI conversation already marked
deleted — irreversible, and intended.

## Running the SQL checks

One file per part in `supabase/tests/` (`part-a-archive.sql`, `part-b.sql` …
`part-f.sql`). Each is ONE transaction that ends in `ROLLBACK`, impersonates
real roles with `set local role authenticated` + `request.jwt.claims`, picks
its actors from live data, and RAISES on the first failed assertion. Run each
after its part's migrations are applied, as the project's connection role:

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-f.sql
```

(or paste into the Supabase SQL editor / MCP `execute_sql`). A pass prints
only `ok:` notices and ends in ROLLBACK; nothing is written. All pass as of
2026-10-14 (run inside `bundles/dry-run.sql`).

## Environment variables

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything |
| `SUPABASE_SERVICE_ROLE_KEY` | server routes: account deletion, invites, crons, purges |
| `NEXT_PUBLIC_BASE_URL` | links in emails and invites |
| `CRON_SECRET` | every cron route in `vercel.json` (Bearer token) |
| `RESEND_API_KEY`, `EMAIL_FROM` | email; sent only in production or with `EMAIL_DEV_SEND=1` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web push (Part D); without them the Push row is hidden |
| `OTP_PEPPER` | optional; signup-code hashing falls back to the service-role key |
| `GROQ_API_KEY` (+ optional `GROQ_BASE_URL`, `AI_MODEL_*`, `AI_TIMEOUT_MS`, `AI_GROUNDING_DOMAINS`) | the AI assistant |
| `AI_MEDIA_RETENTION_DAYS` | optional, default 7 |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | optional, the support address on legal pages |

`.env.example` lists all of them except the optional `OTP_PEPPER`,
`EMAIL_DEV_SEND` and `GROQ_BASE_URL`. Crons (`vercel.json`): AI media purge, care
reminders (15 min), evidence purge, accommodation-doc purge, signup purge,
notification dispatch (5 min).

## Lint

`pnpm lint` runs ESLint 9 with `eslint-config-next` 16 (core-web-vitals +
typescript), flat config in `eslint.config.mjs`. Two React-compiler rules are
downgraded to warnings, each with its reason in the config:
`react-hooks/set-state-in-effect` (every data hook clears its error and raises
`isLoading` at the top of the fetch effect) and `react-hooks/purity` (screens
read the clock while rendering, on purpose). The remaining warnings are mostly
unused variables in older screens — real but harmless, left for a cleanup pass.

## Standing environment facts

- **pnpm is not on the default PATH.** Prefix with
  `PATH="$HOME/.corepack-bin:$PATH"`. Version 9.15.9 — do not upgrade; pnpm 11
  writes a `pnpm-workspace.yaml` pnpm 9 cannot read, and Vercel infers pnpm 9
  from the lockfile.
- **Supabase project:** `Pet10x`, ref `ekgejmxgnlmdomkpblki`.
- **`supabase db reset` has never been run** and 30 of the Phase-era local
  migration files differ from what ran (`2026-08-23-migration-drift.md`).
  Still the largest untested claim.
- **`MCR2026`** is Maple Court Residences — the most useful fixture.
- **Pass `contentType` on every signed storage upload**, or the bucket answers
  `415 invalid_mime_type` three layers from the cause.

## Open items, owned by nobody

- Co-resident profiles are invisible outside `community_identities()`; a
  manager of more than one building cannot use the community screen.
- `exportMyData` omits accommodation data, deliberately (`legal_note`).
- A case opened against a unit with no resident and a case whose resident
  deleted their account both read "Unassigned" — the record cannot tell them
  apart, by design (it no longer names the person).
- Approvals → Request Info on a pet registration stays removed; see
  `2026-08-21-deferred-controls.md` for the twenty lines that would restore it.

## The single most important thing learned

> Enumerating the payload is not the same as characterising the class.

Validate with a **positive grammar for what is allowed**, never a denylist.
Part F applied it once more: the referential SET NULL that account deletion
needs is admitted by `person_ref_released()` — a person column going to NULL,
the profile gone, the write not made by a client role — and by nothing else.
