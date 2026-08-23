-- A place for what a manager actually wrote.
--
-- AD-9. Two things that look alike are kept apart, and the whole phase turns on
-- the distinction:
--
--   `buildings.pet_rules` (jsonb) holds ENFORCEABLE REQUIREMENTS — six booleans
--   plus max_weight_kg / max_pets_per_unit — which feed `computeCompliance`
--   (lib/data/live.ts:53), the resident's missing-info card and every
--   compliance percentage in the manager's portfolio. A MACHINE checks them.
--
--   `building_rules` (this table) holds AUTHORED TEXT — a category, a title, a
--   body, written by a person. Nothing checks it. It is a statement, not a
--   predicate.
--
-- Merging them means a manager typing "no dogs over 25 kg" into a parking
-- notice silently moves somebody's compliance score. The database keeps them
-- apart and the screens that show both say which is which.
--
-- ---------------------------------------------------------------------------
-- DIVERGENCES FROM THE SPEC'S "Migration H", stated rather than left to be
-- discovered by whoever diffs them later:
--
--   1. `buildings.rules` DOES NOT EXIST. The spec and two TypeScript field
--      names (`PortfolioBuilding.rules`, `ManagerBuilding.rules`) say `rules`;
--      the column is `pet_rules`. Verified against information_schema on
--      2026-08-23. Nothing in this phase names a `rules` column.
--
--   2. Migration H specifies `is_published boolean not null default true`.
--      This is `default false`, and that is load-bearing. Saving text and
--      publishing it are two acts. Publishing is what notifies nine residents,
--      so it has to be separable from typing — a default of `true` makes the
--      first act perform the second, and a manager who saves a half-written
--      draft has served it on the building.
--
--   3. Migration H gives managers "full read and write". DELETE is admin-only
--      here (`building_rules_admin_delete`). A published rule is a statement
--      residents were notified of; making it vanish without a trace is not an
--      edit. Managers unpublish, which `publish_building_rule` audits.
--
-- ---------------------------------------------------------------------------
-- EVERY FOREIGN KEY, AND ITS `on delete` ACTION, STATED
--
--   `building_id -> buildings(id) ON DELETE CASCADE`. A deleted building has no
--   house rules; there is no record here that outlives its subject, and unlike
--   `violation_disputes` (which chose RESTRICT) nothing in this table is
--   evidentiary — it is the building's own notice board.
--
--   `created_by -> profiles(id) ON DELETE SET NULL` and
--   `updated_by -> profiles(id) ON DELETE SET NULL`. Deliberately NOT NO ACTION:
--   these are nullable attribution, not the record itself, and a departed
--   manager must not be able to block their successor from deleting a profile —
--   nor should removing the person erase the rule nine residents were notified
--   of. The authorship goes; the statement stays. `audit_log` keeps the
--   durable "who did what" (`building_rule.saved` / `.published`), which is the
--   record that actually has to survive.

create type public.building_rule_category as enum
  ('pets','parking','noise','waste','common_areas','other');

comment on type public.building_rule_category is
  'Closed vocabulary for a house rule''s subject. Closed rather than free text so a resident gets the same predictable grouping in every building, and so a seventh value has to be a decision somebody makes in SQL rather than a typo one manager makes in a form. `parking` is a member and not a special case: the user asked for parking, but the spec already names noise, waste, common areas and pets, and a bespoke parking table would need a sibling the first time somebody asks about noise.';

create table public.building_rules (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.buildings(id) on delete cascade,
  category     public.building_rule_category not null,
  title        text not null,
  body         text not null,
  is_published boolean not null default false,
  sort_order   integer not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  updated_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- These REJECT. They never truncate. 8000 characters is roughly three pages
  -- of bylaw text; the editor carries a live counter so the limit is hit in the
  -- composer, where the manager can do something about it, rather than at the
  -- database after they pressed Save.
  constraint building_rules_title_present check (btrim(title) <> ''),
  constraint building_rules_body_present  check (btrim(body)  <> ''),
  constraint building_rules_title_len     check (char_length(title) <= 120),
  constraint building_rules_body_len      check (char_length(body)  <= 8000)
);

comment on table public.building_rules is
  'Manager-authored house rules, read by residents once published. PLAIN TEXT, not markdown: the requirement is that what the manager typed is what the resident reads, and a renderer is a rewriter — it eats # and *, collapses single newlines, and mangles `s. 3(4)`. Bodies render with white-space: pre-wrap and React escapes them by construction. Structure comes from the row (category, title, sort_order), never from syntax inside the body.';

comment on column public.building_rules.is_published is
  'Defaults FALSE. Saving is not publishing: publishing is the act that notifies the building''s residents, so it goes through publish_building_rule() and is guarded by building_rules_publish_guard (20260825000001). A plain UPDATE of this column raises.';

comment on column public.building_rules.body is
  'The manager''s text, verbatim. Only the outermost whitespace is trimmed — internal line breaks and blank lines ARE the content and are never normalised.';

-- Every read is building-scoped and category-grouped; `groupByCategory` orders
-- within a category by sort_order then created_at.
create index building_rules_building_idx
  on public.building_rules (building_id, category, sort_order);

-- Reuses the existing public.set_updated_at(), the same function
-- trg_buildings_updated runs (confirmed against pg_get_triggerdef).
create trigger trg_building_rules_updated
  before update on public.building_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS, as a POSITIVE GRAMMAR: five policies, each naming who MAY.

alter table public.building_rules enable row level security;

-- A resident reads what has been published to the building they actually live
-- in. `is_published` is NOT NULL, so this is a two-valued test — no NULL can
-- make it neither true nor false. `is_resident_of` already requires an approved
-- link AND a non-suspended profile.
create policy building_rules_resident_read on public.building_rules
  for select using (is_published and public.is_resident_of(building_id));

-- A manager reads everything for their own buildings, drafts included — the
-- draft is the thing they are still writing.
create policy building_rules_manager_read on public.building_rules
  for select using (public.manages_building(building_id) or public.is_admin());

create policy building_rules_manager_insert on public.building_rules
  for insert with check (public.manages_building(building_id) or public.is_admin());

-- The WITH CHECK is what stops a manager MOVING a rule into a building they do
-- not manage. USING alone would authorise the row they started from and say
-- nothing about the row they are creating.
create policy building_rules_manager_update on public.building_rules
  for update using (public.manages_building(building_id) or public.is_admin())
          with check (public.manages_building(building_id) or public.is_admin());

-- There is deliberately NO manager DELETE policy. See the divergence note
-- above: managers unpublish, admins delete.
create policy building_rules_admin_delete on public.building_rules
  for delete using (public.is_admin());

-- Supabase's ALTER DEFAULT PRIVILEGES hands `anon` the full DML set on every
-- new table in `public`, so RLS is the only thing standing between an
-- unauthenticated caller and this table. It is enough — no policy admits anon,
-- so every read returns zero rows and every write is refused — but the grant
-- being there at all is exactly the "policy ready, just add the column" shape
-- Phase 0 recorded on `buildings`. Removing it makes the absence of an anon
-- capability structural rather than a consequence of five policies all
-- happening to mention a signed-in role.
--
-- Revoked FROM ANON BY NAME, not `from public`: `anon` holds these as a direct
-- grant, and `revoke ... from public` would leave anon's own grant untouched —
-- the exact no-op that 20260615073613_harden_security.sql's seven revokes
-- turned out to be. Asserted afterwards by reading role_table_grants back.
revoke all on public.building_rules from anon;
