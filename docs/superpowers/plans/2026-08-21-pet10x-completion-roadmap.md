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

| # | Phase | Delivers | Depends on | Plan |
| --- | --- | --- | --- | --- |
| 0 | Foundation | Test harness, migration drift repair, AD-11 escalation fix + data repair, storage policies, capability matrix | — | [`phase-0`](./2026-08-21-phase-0-foundation.md) |
| 1 | Evidence end-to-end | Migration C, sign route, upload UI, manager display, purge cron | 0 | not yet written |
| 2 | One composer | `IncidentComposer`, both report shells, signed pet photos (AD-3) | 1 | not yet written |
| 3 | Multi-pet care | Household schedule strip, per-pet goal selector, pet named in every sheet (AD-10) | — | not yet written |
| 4 | Enforcement ladder | Migrations D + F, manager actions real, fine schedule in bylaws, derived tab counts, CSV export | 0 | not yet written |
| 5 | Resident enforcement view | Own violations, events and fines; dispute (Migration E) | 4 | not yet written |
| 6 | Building rules | Migration H, manager editor, resident rules screen (AD-9) | 0 | not yet written |
| 7 | Accommodations | Resident intake + docs, real manager checklist (Migration G) | 0 | not yet written |
| 8 | Community | Events, RSVP, Lost & Found, pin, share | 0 | not yet written |
| 9 | Honest cleanup | Alerts CTA to `/report`, notification actions to `action_target`, dead controls removed | — | not yet written |

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
