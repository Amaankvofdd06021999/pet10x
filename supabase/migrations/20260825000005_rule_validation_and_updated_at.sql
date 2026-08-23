-- The cheap corrections: a validator that meant "blank", and an "Updated" that
-- meant "somebody pressed an arrow".
--
-- Three findings from the Phase 6 review, none of them reachable from a
-- misbehaving client, all of them cases where the code says something narrower
-- or wider than it means. 20260825000001 and 20260825000000 are applied, so the
-- corrections land here.
--
-- ---------------------------------------------------------------------------
-- 1. `btrim` STRIPS ASCII SPACES ONLY
--
-- `manager_save_building_rule` refused an empty rule with `v_body = ''` after
-- `v_body := btrim(coalesce(p_body,''))`. One-argument `btrim` removes SPACES.
-- It does not remove tabs or newlines. Measured:
--
--     btrim(E'\n\n\t\n') = ''      -> false   (old check: accepted)
--     btrim(E'\n\n\t\n') !~ '\S'  -> true    (new check: refused)
--
-- So a body of newlines and tabs passed validation, passed the CHECK
-- constraint (`btrim(body) <> ''`, the same weakness), stored a rule that
-- renders as a blank card, and — once published — notified every approved
-- resident about a notice with nothing in it.
--
-- Not reachable from the app: `building-rules-editor.tsx:85` blocks it and
-- JavaScript's `.trim()` does strip newlines. Reachable from any direct RPC
-- call. Both halves are corrected: the RPC so the caller still gets a
-- renderable `{ok:false, error:'empty'}` rather than a 23514, and the CHECK
-- constraints so the invariant holds at the table for every future writer too.
--
-- ---------------------------------------------------------------------------
-- 2. REORDERING A RULE MADE IT LOOK EDITED
--
-- `trg_building_rules_updated` fired `set_updated_at()` on EVERY update. The
-- editor's `move()` (building-rules-editor.tsx:129) reorders by round-tripping
-- title and body back through `saveBuildingRule` to write `sort_order`, so
-- pressing an arrow bumped `updated_at`, and the resident's card then read
-- "Published by your building manager - Updated just now" about a rule whose
-- text nobody had touched.
--
-- That is precisely what Decision 7 says the line is for: `updated_at` is a
-- claim that the RULE changed, and a claim a resident cannot verify is worse
-- than no line at all. So the trigger gains a WHEN clause naming the columns a
-- resident can actually perceive: the text, the category it files under, and
-- whether it is published. `sort_order` and `updated_by` alone no longer move
-- it.
--
-- Stated as a WHEN clause on the trigger rather than fixed in the editor,
-- because the editor is not the only writer and the meaning of `updated_at`
-- belongs to the column, not to one caller of it.
--
-- ---------------------------------------------------------------------------
-- 3. NOT DONE: `audit_log.actor_role`
--
-- Left NULL by both of this phase's writers. Deliberately: all 35 pre-existing
-- rows are NULL and no action in the project has ever populated it. Filling it
-- for two action types out of the whole log would make the column mean
-- "sometimes recorded", and a reader could no longer tell a null that means
-- "this actor had no role" from one that means "this writer did not bother".
-- Either every writer populates it or none does; that is a project-wide
-- decision, not Phase 6's to take unilaterally. Recorded here so the next
-- person meets the reasoning rather than the gap.

-- ---------------------------------------------------------------------------
-- 1a. THE RPC. 20260825000001's body verbatim, with the empty check restated.

create or replace function public.manager_save_building_rule(
  p_rule       uuid,
  p_building   uuid,
  p_category   public.building_rule_category,
  p_title      text,
  p_body       text,
  p_sort_order integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.building_rules%rowtype;
  v_building uuid;
  v_title    text := btrim(coalesce(p_title, ''));
  -- Only the OUTERMOST whitespace is trimmed. Internal line breaks and blank
  -- lines are the content: this phase exists so that what the manager typed is
  -- what the resident reads, and normalising the interior would be exactly the
  -- silent rewrite it is meant to prevent.
  v_body     text := btrim(coalesce(p_body, ''));
  v_id       uuid;
  v_pub      boolean;
  v_created  boolean := false;
begin
  -- CORRECTED IN 20260825000005. This was `v_title = '' or v_body = ''`, which
  -- leans on `btrim` to have removed everything — but one-argument `btrim`
  -- strips ASCII SPACES ONLY. A body of E'\n\n\t\n' survived it unchanged,
  -- compared unequal to '', passed this check, satisfied the equally
  -- space-only CHECK constraint, and stored a rule that renders as a blank card
  -- and notifies the building about nothing.
  --
  -- Stated positively, which is the form a validator should take: a title and a
  -- body must each contain AT LEAST ONE character that is not whitespace.
  -- `\S` is Postgres's own whitespace class, so it covers tabs, newlines and
  -- U+00A0 without this function keeping a list of what to reject.
  --
  -- NOTE: what is STORED is still exactly `btrim(input)`, unchanged. This is a
  -- test about whether to accept the value at all, not a new normalisation —
  -- interior line breaks and blank lines remain the manager's content.
  if v_title !~ '\S' or v_body !~ '\S' then
    -- Refused before the CHECK constraint has to, so the client gets something
    -- it can render instead of a 23514.
    return jsonb_build_object('ok', false, 'error', 'empty');
  end if;
  if char_length(v_title) > 120 or char_length(v_body) > 8000 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;

  if p_rule is null then
    v_building := p_building;
    if v_building is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  else
    select * into v_existing from public.building_rules where id = p_rule for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    -- Authorise against the EXISTING row's building, never the caller's
    -- argument. Trusting p_building here would let a manager of B edit a rule
    -- of A by naming B.
    v_building := v_existing.building_id;
    if p_building is not null and p_building <> v_building then
      -- A rule does not move buildings. Refused rather than silently ignored,
      -- so a client that thinks it is moving one finds out.
      return jsonb_build_object('ok', false, 'error', 'building_mismatch');
    end if;
  end if;

  if not (public.manages_building(v_building) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_rule is null then
    insert into public.building_rules
      (building_id, category, title, body, sort_order, created_by, updated_by)
    values
      (v_building, p_category, v_title, v_body,
       coalesce(p_sort_order,
                (select coalesce(max(sort_order), -1) + 1
                   from public.building_rules
                  where building_id = v_building and category = p_category)),
       auth.uid(), auth.uid())
    returning id, is_published into v_id, v_pub;
    v_created := true;
  else
    update public.building_rules
       set category   = p_category,
           title      = v_title,
           body       = v_body,
           sort_order = coalesce(p_sort_order, sort_order),
           updated_by = auth.uid()
     where id = p_rule
    returning id, is_published into v_id, v_pub;
  end if;

  -- `is_published` is not in either statement, so the guard's WHEN test is
  -- false on the update and the INSERT's value is the column default (false).
  -- Neither needs a token.

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'building_rule.saved', 'building_rule', v_id, v_building,
          jsonb_build_object('category', p_category::text,
                             'published', v_pub,
                             'created', v_created,
                             'title_len', char_length(v_title),
                             'body_len', char_length(v_body)));

  return jsonb_build_object('ok', true, 'id', v_id, 'is_published', v_pub, 'created', v_created);
end;
$$;

-- 1b. THE SAME RULE AT THE TABLE. `btrim(x) <> ''` has the identical
-- ASCII-space-only weakness, so the constraints are restated in the same terms
-- as the RPC. `building_rules` holds 0 rows, so nothing has to be migrated.
alter table public.building_rules drop constraint if exists building_rules_title_present;
alter table public.building_rules drop constraint if exists building_rules_body_present;
alter table public.building_rules
  add constraint building_rules_title_present check (title ~ '\S');
alter table public.building_rules
  add constraint building_rules_body_present  check (body  ~ '\S');

-- ---------------------------------------------------------------------------
-- 2a. `updated_at` MOVES ONLY FOR A CHANGE A RESIDENT CAN SEE.
--
-- `is_published` is in the list on purpose: publication is the moment a rule
-- becomes something a resident can read, which is a real event in its life.
-- `sort_order` and `updated_by` are not: neither changes a single word the
-- resident is shown.
drop trigger if exists trg_building_rules_updated on public.building_rules;
create trigger trg_building_rules_updated
  before update on public.building_rules
  for each row
  when (old.title        is distinct from new.title
     or old.body         is distinct from new.body
     or old.category     is distinct from new.category
     or old.is_published is distinct from new.is_published)
  execute function public.set_updated_at();
