# Pet10x completion — roadmap

> This is the index, not an executable plan. Each phase below gets its own
> task-by-task plan document, written just before that phase is built.

**Spec:** [`docs/superpowers/specs/2026-08-21-completing-manager-resident-flows-design.md`](../specs/2026-08-21-completing-manager-resident-flows-design.md)

## Why the plans are per-phase

Ten phases written out in full TDD detail at once would run to tens of
thousands of lines, and most of it would be guesswork: the shape of Phase 8's
tasks depends on decisions made while building Phases 1 and 4. A plan that
stale is worse than no plan, because it reads as authoritative.

So each phase is planned immediately before it is built, against the spec and
against the code as it actually stands by then. This document is the fixed
part — the order, the dependencies, and what "done" means for each phase.

## Global constraints

Copied from the spec; every phase inherits them.

- **RLS is the floor, the query is the filter.** Every new read names its scope
  explicitly. Never rely on a policy to narrow an unfiltered select.
- **A control that cannot act must not exist.** No `toast()` standing in for a
  mutation. If a feature is out of scope, remove the control.
- **Cross-user writes go through `SECURITY DEFINER`.** The `notifications`
  insert policy admits only `kind = 'assistant'` for self, so a manager can
  never notify a resident from the browser.
- **Every manager decision writes `violation_events` before it notifies.**
- **Migrations are the source of truth.** Nothing lands in the remote database
  that is not in `supabase/migrations/`.
- **Stack:** Next.js 16, React 19, Supabase (Postgres 17), Tailwind 4,
  `sonner` for toasts, `lucide-react` for icons. Package manager is `pnpm`.

## Phases

**The numbering below is the one actually built, and it is not the numbering
this document shipped with.** Two roadmap phases were merged during Phase 1
(evidence and the single composer turned out to be one change, because the
evidence gap existed *because* there were two composers), and the enforcement
ladder was pulled forward. The original column is kept so older notes remain
readable.

| # | Phase | Delivers | Was | Status | Plan |
| --- | --- | --- | --- | --- | --- |
| 0 | Foundation | Test harness, migration drift repair, AD-11 escalation fix + data repair, storage policies, capability matrix | 0 | **merged to main** | [`phase-0`](./2026-08-21-phase-0-foundation.md) |
| 1 | Evidence end-to-end | Migration C, sign route, upload UI, one `IncidentComposer` for both shells, signed pet photos | 1+2 | **complete** | [`phase-1`](./2026-08-21-phase-1-evidence.md) |
| 2 | Enforcement ladder | Migrations D+F, the three degrees, ledger, twelve manager controls real or removed | 4 | **code-complete, in fix round** | [`phase-2`](./2026-08-21-phase-2-enforcement.md) |
| 3 | Honest cleanup | Alerts CTA to `/report`, notification actions to `action_target`, dead controls removed | 9 | planned | [`phase-3`](./2026-08-21-phase-3-honest-cleanup.md) |
| 4 | Multi-pet care | Household schedule strip, per-pet goal selector, pet named in every sheet (AD-10) | 3 | planned | [`phase-4`](./2026-08-22-phase-4-multi-pet-care.md) |
| 5 | Resident enforcement | Own cases, ledger, fines; dispute filed and decided | 5 | planned | [`phase-5`](./2026-08-22-phase-5-resident-enforcement.md) |
| 6 | Building rules | Authored rule text, resident rules screen, **and the fine schedule editor Phase 2 needs** | 6 | planned | [`phase-6`](./2026-08-22-phase-6-building-rules.md) |
| 7 | Accommodations | Resident intake + documents, real manager checklist, retention | 7 | planned | [`phase-7`](./2026-08-22-phase-7-accommodations.md) |
| 8 | Community | One authorisation grammar for six tables, then events, RSVP, Lost & Found | 8 | planned | [`phase-8`](./2026-08-22-phase-8-community.md) |

### What planning phases 4-8 in parallel turned up

Each planner was told to verify every column, signature and policy against
`supabase/migrations/` and the live database rather than against this spec.
That instruction paid for itself five times over, and the findings are not
evenly distributed -- they cluster where the spec was most confident:

- **"No DDL" was wrong twice.** Migration G says accommodations need none; the
  documents table has six columns and lacks every field a worked checklist
  reads. Migration G says the same of community; six policy replacements,
  three triggers and two `set not null` say otherwise.
- **"RLS is already correct for all of these" was exactly backwards.** Measured
  in rolled-back transactions: a resident of one building inserted a lost-pet
  report, an event, AND an accommodation request into a DIFFERENT building, and
  created a `building_id = null` row visible to every user on the platform.
- **The capability matrix recorded two holes as features.** It credits
  `accom_resident_insert` and `accom_manager_update`; the first checks only
  `resident_id = auth.uid()`, and the second is `FOR UPDATE` over every column
  -- so a manager can move a request's `building_id`, which relocates who may
  read the doctor's letter attached to it.
- **`event_rsvps` under-reports silently.** Two seeded RSVPs read as one, to
  the resident and to the manager alike. Nothing errors.
- **Community posting is impossible for everyone.** 47 profiles, 1 premium,
  and that account is a super-admin with no resident link: `can_post_today = 0`.
- **Account deletion orphans storage forever.** `app/api/account/delete/route.ts`
  deletes rows and touches storage zero times, so a PIPEDA deletion leaves pet
  photos, incident evidence and doctors' letters in the buckets. Broader than
  any one phase.

## Ordering notes

**Phase 0 is load-bearing and unglamorous.** Four RPCs exist only in the remote
database, so `supabase db reset` currently produces a broken app. Every later
migration stacks on that. It also carries AD-11, which is a live
data-integrity defect — a violation on production is currently filed against
the person who reported it.

**Phase 1 is the reported bug** and the reason this work started.

**Phase 2 is what stops it recurring.** The evidence gap existed because one
act — filing a report — has two implementations, and only one was extended.
Shipping Phase 1 without Phase 2 means the next feature gets added to one of
them again.

**Phase 3 depends on nothing** and can be pulled forward or run in parallel. It
is a correctness defect affecting every multi-pet household right now: the home
screen shows only `pets[0]`, so a second pet's medication is invisible.

**Phase 5 needs Phase 4's ledger.** A resident's violation history is
`violation_events`, and nothing writes that table until Phase 4.

## Definition of done, per phase

A phase is done when all of the following hold:

1. Its tasks are complete and committed.
2. `pnpm build` and `pnpm lint` pass.
3. Its migrations apply cleanly to a scratch Supabase branch from empty, and
   the app boots against the result.
4. Its rows of the capability matrix in `docs/RBAC_CAPABILITIES.md` are
   verified by SQL impersonation — allowed cases allowed, denied cases denied.
5. No control it touched calls `toast()` in place of a mutation.

## Out of scope

Named in the spec, repeated here so it is not rediscovered mid-build: fine
payment, resident–manager messaging, granular per-manager roles, the 23
settings menu stubs, rule versioning and acknowledgement, and multi-carer
household task assignment.
