-- A dispute is a row with a decision on it, not three nullable columns.
--
-- WHAT THE SPEC ASKED FOR, AND WHY THIS IS NOT IT
--
-- AD-7's Migration E adds `disputed_at`, `dispute_reason` and `dispute_stage`
-- to `violations`. That migration was never applied — verified before writing
-- this file: `information_schema.columns` returns 0 rows for
-- `violations.dispute%`, and Phase 2's Task 4 lost a task to a brief that
-- quoted those columns as though they existed. So there is no legacy shape to
-- honour here, only a design to choose, and the columns are the worse one:
--
--   * "A resident disputes a specific degree once" is a UNIQUENESS
--     CONSTRAINT, and three nullable columns cannot express it. Once
--     `disputed_at` is cleared for the next degree — which AD-7 explicitly
--     requires — "has this degree already been disputed?" is answerable only
--     by matching strings in `violation_events.note`. `unique (violation_id,
--     stage)` below makes the rule the database's rather than a convention.
--
--   * The three columns are only meaningful TOGETHER. `disputed_at` set with
--     `dispute_stage` null is a corrupt row and nothing on `violations` would
--     prevent it. Here one CHECK makes the decision atomic: outcome, decider
--     and timestamp arrive together or not at all.
--
--   * AD-7's own requirement that the history survive is what the columns
--     cannot do. It resolves that by putting the outcome in
--     `violation_events`, which splits one dispute across two places joined by
--     prose. A dispute row holds the filing and its decision in one place.
--
-- The write surface is identical either way: this table gets NO client INSERT,
-- UPDATE or DELETE policy at all — the shape Phase 2 landed on for
-- `violation_events` after four review rounds — and the two RPCs in
-- 20260824000001 and 20260824000002 are its only writers.
--
-- ---------------------------------------------------------------------------
-- EVERY FOREIGN KEY, AND ITS `on delete` ACTION, STATED
--
-- `violation_id -> violations(id) ON DELETE RESTRICT`. The standard
-- `violation_events_violation_id_fkey` was raised to in Phase 2, for a reason
-- that was MEASURED rather than reasoned: `violations_building_id_fkey` is
-- ON DELETE CASCADE, `buildings_admin_all` is FOR ALL USING is_admin(), and
-- `lib/data/admin.ts:145` deleteBuilding() sits behind a live admin button. An
-- RI cascade runs as the CONSTRAINT OWNER and is not subject to RLS, so no
-- policy on this table would stop a building deletion from erasing its
-- disputes. Only RESTRICT does. `NO ACTION` would be equivalent in effect at
-- statement end, but the sibling table says RESTRICT and matching it means one
-- sentence describes both. Erasure stays possible in two deliberate
-- statements, which is the right friction for an evidentiary record.
--
-- `filed_by -> profiles(id)` and `decided_by -> profiles(id)`, both NO ACTION
-- (the default, stated rather than left implicit). A person cannot be deleted
-- while a dispute they filed or decided is on record — the same guarantee
-- `violation_events_actor_id_fkey` gives, which is also NO ACTION.

create type public.dispute_outcome as enum ('upheld', 'overturned');

comment on type public.dispute_outcome is
  'How a manager decided a resident''s appeal. `upheld` = the finding stands and the fine becomes payable again; `overturned` = the case is dismissed and the fine waived. Deliberately two values: "withdrawn by the resident" is not modelled, because nothing in this phase lets a resident withdraw one.';

create table public.violation_disputes (
  id           uuid primary key default gen_random_uuid(),
  violation_id uuid not null references public.violations(id) on delete restrict,
  -- The rung the case sat on when the appeal was filed, captured at filing
  -- time. It is NOT read back off `violations.stage` later: an upheld dispute
  -- leaves the case free to escalate, and the record has to keep saying which
  -- degree was contested.
  stage        public.violation_stage_v2 not null,
  filed_by     uuid not null references public.profiles(id) on delete no action,
  reason       text not null,
  filed_at     timestamptz not null default now(),
  outcome      public.dispute_outcome,
  decided_by   uuid references public.profiles(id) on delete no action,
  decided_note text,
  decided_at   timestamptz,
  constraint violation_disputes_one_per_degree unique (violation_id, stage),
  constraint violation_disputes_decision_whole check (
    (outcome is null and decided_at is null and decided_by is null)
    or (outcome is not null and decided_at is not null and decided_by is not null)
  )
);

comment on table public.violation_disputes is
  'One row per degree of a violation a resident has formally contested. Written only by dispute_violation() and manager_resolve_dispute(); there is no client INSERT, UPDATE or DELETE policy. `outcome is null` IS the open-dispute signal — the single input to the manager''s Disputed tab and to the resident''s screen. fines.status = ''disputed'' is a CONSEQUENCE written alongside it, never a second source of truth.';

comment on column public.violation_disputes.reason is
  'The resident''s own words, verbatim (btrim''d, 2000 characters at most). Shown to the case''s managers and back to the resident. Never quoted into a notification body — the case detail is where it is read, in context.';

comment on constraint violation_disputes_one_per_degree on public.violation_disputes is
  'One dispute per degree. A resident who loses an appeal at `warning` may appeal again at `fine_1` — a new finding is a new thing to contest — but may not re-file against the same one.';

-- The open-dispute lookup, which every screen in this phase performs and which
-- `manager_advance_violation` performs on every stage move. Partial on
-- `outcome is null` because a decided dispute is never the subject of it.
create index violation_disputes_open_idx
  on public.violation_disputes (violation_id)
  where outcome is null;

-- ---------------------------------------------------------------------------
-- RLS: read only, mirroring `vevents_select` exactly.
--
-- The case's managers, admins, and the resident the case is about. Nothing
-- else, and no write policy of any kind — attempted INSERT/UPDATE/DELETE by
-- any JWT-bearing role affects zero rows, because RLS denies by default once
-- enabled and no permissive policy names those commands.
alter table public.violation_disputes enable row level security;

create policy vdisputes_select on public.violation_disputes
  for select using (exists (
    select 1 from public.violations v
    where v.id = violation_id
      and (public.manages_building(v.building_id) or public.is_admin()
           or v.resident_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- THE BACKFILL
--
-- `fines.status = 'disputed'` is a value no client can reach: `fines` has one
-- write policy (`fines_manager_update`) and `trg_fines_settle_only` restricts
-- any client UPDATE to `status`, while a resident has no write path to `fines`
-- at all. So the one live row carrying it was set by the seed or by
-- service_role. Phase 2 derived its whole `disputed` signal from that value;
-- this phase retires the derivation, so the row has to become a real dispute
-- or the signal disappears from a live case.
--
-- Driven by the query rather than by a literal id, so it is correct on any
-- database this file is replayed against, including a fresh seed.
--
-- The reason text says what is and is not known. Inventing a plausible
-- complaint would be fabricating evidence in a record whose entire purpose is
-- to be evidence.
--
-- NOTE THE STAGE THIS PRODUCES: the one live disputed fine belongs to a case
-- at `open`, and `dispute_violation` (20260824000001) refuses `open` — a case
-- at `open` is "we are looking into it", not a finding anyone can contest.
-- That is exactly why the disputable-stage rule lives in the RPC and NOT in a
-- CHECK constraint here: a CHECK cannot be conditional on a row's age, and the
-- choice would be between recording the truth about a legacy row and weakening
-- the rule for every new one. The RPC is the only writer, so the enforcement
-- point is the same one either way.
insert into public.violation_disputes (violation_id, stage, filed_by, reason, filed_at)
select v.id, v.stage, v.resident_id,
       'Recorded from the fine''s disputed status, which predates this table. '
       'The reason as originally given was not captured.',
       min(f.created_at)
  from public.violations v join public.fines f on f.violation_id = v.id
 where f.status = 'disputed' and v.resident_id is not null
 group by v.id, v.stage, v.resident_id;
