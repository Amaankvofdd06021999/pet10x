# Resume here

Paused 2026-08-21. Read this first; it is the whole handover.

## Where things stand

**Phase 0 is done, merged to `main`, and pushed** (`f0118b9`). The database
migrations from it are live on `Pet10x` and have been since before the push.

**Phase 1 is complete on branch `pet10x-completion`** — all six tasks, reviewed
clean, whole-branch review returned no blocking code findings. Nothing from
Phase 1 is merged or pushed; the branch awaits a merge decision.

## The plan

Nine phases remain from [the roadmap](./plans/2026-08-21-pet10x-completion-roadmap.md).
The human partner asked for all of them, naming two specifically: the manager's
violation actions, and the controls that show "coming soon". Those were pulled
forward, so the order is:

| # | Phase | Plan | State |
| --- | --- | --- | --- |
| 1 | Evidence, in one composer | [`phase-1-evidence`](./plans/2026-08-21-phase-1-evidence.md) | **complete — 6 of 6, reviewed clean** |
| 2 | Enforcement ladder (violations) | [`phase-2-enforcement`](./plans/2026-08-21-phase-2-enforcement.md) | planned, not started |
| 3 | Honest cleanup ("coming soon") | [`phase-3-honest-cleanup`](./plans/2026-08-21-phase-3-honest-cleanup.md) | planned, not started |
| 4 | Multi-pet care | roadmap only | not planned |
| 5 | Resident violations + dispute | roadmap only | not planned |
| 6 | Building rules | roadmap only | not planned |
| 7 | Accommodations intake | roadmap only | not planned |
| 8 | Community | roadmap only | not planned |

Phases 1 and 2 of the original roadmap were merged into one — building evidence
into both report screens and then collapsing them into a shared composer would
implement the same feature twice, and that duplication is what caused the bug.

## Phase 1, task by task

| Task | State | Commit |
| --- | --- | --- |
| 1. `p_evidence_paths` on the intake RPC | complete, 1 fix round | `5775b80`, `e6ab9a4` |
| 2. Sign + pets server routes | complete, 1 fix round | `1e8f305`, `d742157` |
| 3. The `IncidentComposer` | complete, 1 fix round | `c89fbc9`, `40ea1e6` |
| 4. Both screens become shells | complete, 1 fix round | `f1643ae`, `1a89859` |
| 5. Manager sees the evidence | complete, clean first pass | `f7e7ec5` |
| 6. Purge unclaimed drafts | complete, 2 fix rounds | `b2dea99`, `4d5f7fe`, `1a57f31` |
| Final review fix wave | complete | `8fbb4ea` |

Tests went 15 → 39. `pnpm build` exits 0.

## What to do next

**Decide whether to merge Phase 1.** The whole-branch review said merge, with
one non-code gate: six test incidents sit in Maple Court's live triage queue
(`IR-C4DF60`, `IR-E04C1E`, `IR-CC086C`, `IR-6549F4`, `IR-3A10BE`, `IR-816E7B`),
clearly labelled, four carrying real photos. They are *claimed*, so the purge
route will never remove them — they are permanent unless deleted deliberately.

Then **Phase 2** — the manager's violation actions, planned and not started.

### Two things that cost real time, kept because they will recur

**Pass `contentType` on every storage upload.** `uploadToSignedUrl` defaults the
PUT to `text/plain;charset=UTF-8`, and a signed upload token binds path, upsert,
scope and expiry — never Content-Type. `guest-evidence` enforces an image
allow-list, so an uploader omitting `{ contentType: file.type }` is rejected at
storage with the cause three layers from the symptom. Measured: the default
returns `415 invalid_mime_type`.

**The vitest `@` alias is proven and fine.** Phase 0 deferred a worry that it
resolved to a doubled separator. Phase 1's first runtime `@/` import exercised
it and it resolves. No action needed.

## Standing environment facts

- **pnpm is not on the default PATH.** Prefix every pnpm command with
  `PATH="$HOME/.corepack-bin:$PATH"`. Active version is 9.15.9 — do not upgrade
  it; pnpm 11 generates a `pnpm-workspace.yaml` that pnpm 9 cannot even start
  with, and Vercel infers pnpm 9 from the lockfile.
- **No Supabase CLI, no Docker.** Migrations go through the Supabase MCP
  (`apply_migration`), assertions through `execute_sql`. `supabase db reset` has
  never been run and remains this work's largest untested claim.
- **`pnpm lint` cannot pass** — `eslint` is in the script but is not a
  dependency and has no config, on `main` too. Pre-existing.
- **Supabase project:** `Pet10x`, ref `ekgejmxgnlmdomkpblki`. The human partner
  has authorised applying migrations directly to it.
- **`MCR2026`** is Maple Court Residences — 10 pets, exactly one with a photo.
  The single most useful test fixture in the project.

## Process that earned its keep

Work is executed with `superpowers:subagent-driven-development`: one implementer
per task, a fresh reviewer against its diff, fix rounds until clean. Two rules
learned the hard way and worth keeping:

- **Never run two implementers at once.** Reviewers are read-only and may
  overlap anything; implementers may not overlap each other. A near-miss had one
  agent's `git add -A` staging another's in-flight file.
- **Copy agent ids from the ledger, never from memory.** A fix message was sent
  to the wrong agent — it refused, correctly, and cost only time.

The per-phase ledger lives at `.superpowers/sdd/<plan-name>/progress.md`. It is
**gitignored**, so it does not survive a fresh clone. Everything durable from
Phase 0 was promoted into
[the findings doc](./2026-08-21-phase-0-findings.md) before its workspace was
deleted; do the same at the end of each phase.

## Open decisions waiting on the human partner

None block the work, but all three shape later phases.

1. **`posts_insert` requires a premium subscription** and has no
   `manages_building` disjunct, so a manager cannot post to their own
   building's feed and non-premium residents cannot post at all. This decides
   how much of Phase 8 is worth building.
2. **`emergency_directory` contradicts its own documentation** — the header says
   medical history is withheld, the body returns `p.conditions`. Amend the
   comment or strip the field.
3. **The `revoke … from anon` no-ops** — seven of them, leaving `is_premium` and
   `resolve_entitlement` callable by anyone. Small, self-contained fix. See the
   findings doc.

## The single most important thing learned

From Phase 1's path-traversal guard, where three parties looked at the same bug
and two of us proposed a fix carrying the same defect:

> Enumerating the payload is not the same as characterising the class.

Validate by stating a **positive grammar for what is allowed**, never a denylist
of what is not. When probing a guard, test the *shape* of the attack rather than
the one instance that was reported — and treat any confident "this is
sufficient", including your own, as the sentence most worth probing.

## 2026-08-23 — machine slept again, four agents lost

Second occurrence. The first is recorded in commit 55e886d. Lost mid-flight:
the Task 5 review, the Phase 4 planner (and a helper it had spawned), and the
Phase 5 planner. None had produced output. All relaunched from the same briefs.

Two operational lessons, both cheap to apply:
  - A planner or reviewer that spawns its own helper doubles the blast radius
    of a sleep -- both die together and neither reports. Every planning and
    review brief now says "do all of this yourself".
  - Nothing was lost that had been committed. Task 5 was committed (4b58dd9)
    before the sleep, so the phase lost only review time, not work.

State at the time of the sleep, all committed and safe:
  Phase 0  merged to main, pushed
  Phase 1  complete on this branch
  Phase 2  CODE-COMPLETE at 4b58dd9, under review
  Phase 3  planned (docs/superpowers/plans/2026-08-21-phase-3-honest-cleanup.md)
  Phase 4-8  being planned now

## Migration number allocation (set 2026-08-23 after a real collision)

Phases 4-8 were planned in parallel and two plans claimed the same number.
Phase 6 originally took 20260823000006, which the Task 5 fix round had already
created on disk as `reminder_throttle_and_opening_event`. Renumbered.

  20260821000* - 20260823000006   on disk, Phases 0-2
  20260824000*                    Phase 5, disputes
  20260825000*                    Phase 6, building rules
  20260826000*                    Phase 8, community
  20260827000*                    Phase 7, accommodations

`ls supabase/migrations/` is the ground truth. Do not assume a number is free
because the design doc used it -- the doc predates every phase.
