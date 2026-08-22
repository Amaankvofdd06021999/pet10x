# Resume here

Paused 2026-08-21. Read this first; it is the whole handover.

## Where things stand

**Phase 0 is done, merged to `main`, and pushed** (`f0118b9`). The database
migrations from it are live on `Pet10x` and have been since before the push.

**Phase 1 is in progress on branch `pet10x-completion`**, 7 commits ahead of
`origin/main`. Nothing from Phase 1 is merged or pushed.

## The plan

Nine phases remain from [the roadmap](./plans/2026-08-21-pet10x-completion-roadmap.md).
The human partner asked for all of them, naming two specifically: the manager's
violation actions, and the controls that show "coming soon". Those were pulled
forward, so the order is:

| # | Phase | Plan | State |
| --- | --- | --- | --- |
| 1 | Evidence, in one composer | [`phase-1-evidence`](./plans/2026-08-21-phase-1-evidence.md) | **in progress — 2 of 6 tasks done** |
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
| 1. `p_evidence_paths` on the intake RPC | **complete**, reviewed clean after 1 fix round | `5775b80`, `e6ab9a4` |
| 2. Sign + pets server routes | **complete**, approved, fix round landed | `1e8f305`, `d742157` |
| 3. The `IncidentComposer` | **next** | — |
| 4. Both screens become shells | queued | — |
| 5. Manager sees the evidence | queued | — |
| 6. Purge unclaimed drafts | queued | — |

Task 2's fix round landed at `d742157` just before the pause. It closed two
findings: two discarded Supabase `error` values that turned a real failure into
a misleading success (an infrastructure outage told the reporter "that building
code isn't recognised"; a signing failure returned HTTP 200 with every
`photoUrl` null), and a `{"files":[null]}` payload that threw a 500 where every
other malformed input got a 400. **It has not been reviewed** — a scoped
re-review of `3866370..d742157` is the first thing to dispatch on resuming.

## What to do next

1. Dispatch the scoped re-review of Task 2's fix round (`3866370..d742157`).
2. Start **Task 3** — write `components/screens/report/incident-composer.tsx`
   and `lib/data/evidence.ts`. The plan has the complete code for
   `lib/data/evidence.ts` and its four tests.

### Two things Task 3 must not miss

**Pass `contentType` on every upload.** `uploadToSignedUrl` defaults the PUT
`Content-Type` to `text/plain;charset=UTF-8`, and a signed upload token binds
path, upsert, scope and exp — never Content-Type. `guest-evidence` now enforces
an image allow-list, so an uploader that omits `{ contentType: file.type }` is
rejected at storage, with the cause three layers from the symptom. The plan's
snippet is already corrected; keep it that way.

**Prove the vitest `@` alias.** `vitest.config.ts` resolves `@` to a path with a
trailing slash, so `@/lib/x` becomes `<root>//lib/x`. POSIX collapses it and it
should work, but nothing has ever exercised it. `lib/data/evidence.test.ts` is
the first test with a runtime `@/` import, so it either proves the alias or
fails. If it fails, the fix is
`path.dirname(fileURLToPath(import.meta.url))`.

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
