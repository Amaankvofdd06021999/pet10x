-- Part B — manager tools, impersonated, in ONE rolled-back transaction.
--
-- Not yet run: written before 20261008000001…000007 were applied (no database
-- was reachable from the session that wrote it). Run it after they are, as the
-- project's own connection role (the Supabase SQL editor or MCP `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-b.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written: the fixtures it
-- plants (two fines, pet documents, an empty building) and the archive all
-- roll back.
--
-- Actors come from live data: Maple Court Residences (MCR2026), a non-admin
-- manager of it, a current pet in it with its owner, and a non-admin owner
-- from a different building. Each is asserted is_admin() = false inside its
-- own impersonation, because most checks carry is_admin() as a disjunct.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_pet uuid; v_owner uuid; v_manager uuid; v_other uuid;
  v_vio uuid; v_fine uuid; v_fine2 uuid; v_doc uuid; v_doc2 uuid; v_doc3 uuid; v_admin uuid; v_empty uuid;
begin
  select b.id into v_building from public.buildings b where upper(b.building_code) = 'MCR2026';
  if v_building is null then raise exception 'FIXTURE: building MCR2026 not found'; end if;

  select p.id, p.owner_id into v_pet, v_owner
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.building_id = v_building and p.deleted_at is null
     and not coalesce(pr.is_super_admin, false)
   order by p.created_at, p.id limit 1;
  if v_pet is null then raise exception 'FIXTURE: no current pet in MCR2026'; end if;

  select bm.profile_id into v_manager
    from public.building_managers bm join public.profiles pr on pr.id = bm.profile_id
   where bm.building_id = v_building and bm.profile_id <> v_owner
     and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   limit 1;
  if v_manager is null then raise exception 'FIXTURE: no non-admin manager of MCR2026'; end if;

  select p.owner_id into v_other
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.owner_id <> v_owner and p.building_id is distinct from v_building
     and not coalesce(pr.is_super_admin, false)
     and not exists (select 1 from public.building_managers bm
                      where bm.building_id = v_building and bm.profile_id = p.owner_id)
   limit 1;
  if v_other is null then raise exception 'FIXTURE: no owner outside MCR2026'; end if;

  -- A case to hang the fine on, when the building has one; the RPC handles a
  -- fine without a case too, and that path is exercised by the second fine.
  select v.id into v_vio from public.violations v
   where v.building_id = v_building and v.resolved_at is null
   order by v.created_at limit 1;

  insert into public.fines (violation_id, building_id, resident_id, amount_cents, currency, status)
  values (v_vio, v_building, v_owner, 12345, 'cad', 'issued')
  returning id into v_fine;
  insert into public.fines (violation_id, building_id, resident_id, amount_cents, currency, status)
  values (null, v_building, v_owner, 5000, 'cad', 'issued')
  returning id into v_fine2;

  insert into public.pet_documents (pet_id, kind, name, status, storage_path)
  values (v_pet, 'municipal_license', 'Part B licence', 'current', v_owner || '/' || v_pet || '/partb.pdf')
  returning id into v_doc;
  insert into public.pet_documents (pet_id, kind, name, status, storage_path)
  values (v_pet, 'liability_insurance', 'Part B insurance (no file)', 'current', null)
  returning id into v_doc2;
  -- Lapsed yesterday, with a file: approve must be refused.
  insert into public.pet_documents (pet_id, kind, name, status, storage_path, expires_on)
  values (v_pet, 'vaccination', 'Part B lapsed', 'expired', v_owner || '/' || v_pet || '/lapsed.pdf', current_date - 1)
  returning id into v_doc3;

  -- An admin, for admin_building_history (it returns nothing to anyone else).
  select pr.id into v_admin from public.profiles pr
   where pr.is_super_admin and not pr.is_suspended limit 1;
  if v_admin is null then raise exception 'FIXTURE: no active super admin'; end if;

  -- A building nobody has used: the only kind Delete is offered for.
  insert into public.buildings (name, building_code)
  values ('Part B empty building', 'PB' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
  returning id into v_empty;

  perform set_config('part_b.building', v_building::text, true);
  perform set_config('part_b.pet', v_pet::text, true);
  perform set_config('part_b.owner', v_owner::text, true);
  perform set_config('part_b.manager', v_manager::text, true);
  perform set_config('part_b.other', v_other::text, true);
  perform set_config('part_b.vio', coalesce(v_vio::text, ''), true);
  perform set_config('part_b.fine', v_fine::text, true);
  perform set_config('part_b.fine2', v_fine2::text, true);
  perform set_config('part_b.doc', v_doc::text, true);
  perform set_config('part_b.doc2', v_doc2::text, true);
  perform set_config('part_b.doc3', v_doc3::text, true);
  perform set_config('part_b.admin', v_admin::text, true);
  perform set_config('part_b.empty', v_empty::text, true);
  raise notice 'fixtures: building % manager % owner % other % case %', v_building, v_manager, v_owner, v_other, v_vio;
end $$;

-- ===========================================================================
-- 1. Fines
-- ===========================================================================

-- 1a. A non-manager is refused, and the fine does not move.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: other user is an admin'; end if;
  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'paid');
  if r->>'error' is distinct from 'forbidden' then
    raise exception 'FAIL: non-manager got % from manager_set_fine_status', r;
  end if;
  raise notice 'ok: non-manager refused (forbidden)';
end $$;
reset role;

-- 1b. The manager: direct UPDATE now changes nothing; illegal targets refused;
--     issued -> paid works; paid -> waived refused.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; n integer;
begin
  if public.is_admin() then raise exception 'FIXTURE: manager is an admin'; end if;

  update public.fines set status = 'waived' where id = current_setting('part_b.fine')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a manager''s direct UPDATE on fines touched % row(s)', n; end if;
  raise notice 'ok: direct UPDATE on fines refused (0 rows; fines_manager_update is gone)';

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'disputed');
  if r->>'error' is distinct from 'illegal_transition' then
    raise exception 'FAIL: issued -> disputed returned %', r;
  end if;
  raise notice 'ok: issued -> disputed refused (illegal_transition)';

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'issued');
  if r->>'error' is distinct from 'illegal_transition' then
    raise exception 'FAIL: issued -> issued returned %', r;
  end if;
  raise notice 'ok: issued -> issued refused (illegal_transition)';

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'paid', 'Cheque received');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL: issued -> paid returned %', r;
  end if;
  raise notice 'ok: issued -> paid accepted %', r;

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'waived');
  if r->>'error' is distinct from 'illegal_transition' or r->>'from' is distinct from 'paid' then
    raise exception 'FAIL: paid -> waived returned %', r;
  end if;
  raise notice 'ok: paid -> waived refused (illegal_transition, from paid)';

  r := public.manager_set_fine_status(current_setting('part_b.fine2')::uuid, 'waived');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL: issued -> waived on a fine with no case returned %', r;
  end if;
  raise notice 'ok: issued -> waived accepted on a fine with no case';
end $$;
reset role;

-- 1c. What it wrote, read as the connection role.
do $$
declare v_vio text := current_setting('part_b.vio');
begin
  if (select status from public.fines where id = current_setting('part_b.fine')::uuid) <> 'paid' then
    raise exception 'FAIL: fine is not paid';
  end if;
  if not exists (select 1 from public.audit_log
                  where action = 'fine.status_changed' and entity_id = current_setting('part_b.fine')::uuid
                    and metadata->>'from' = 'issued' and metadata->>'to' = 'paid') then
    raise exception 'FAIL: trg_fines_settlement_event wrote no audit row';
  end if;
  raise notice 'ok: settlement audit row written by the existing trigger';

  if v_vio <> '' then
    if not exists (select 1 from public.violation_events
                    where violation_id = v_vio::uuid and from_stage = to_stage
                      and note like 'Fine of 123.45 CAD marked paid: Cheque received') then
      raise exception 'FAIL: no violation_events self-transition for the payment';
    end if;
    raise notice 'ok: violation_events row written on the case';
  else
    raise notice 'info: MCR2026 has no open case; the violation_events path was not exercised';
  end if;

  if not exists (select 1 from public.notifications
                  where profile_id = current_setting('part_b.owner')::uuid and kind = 'compliance'
                    and title = 'Fine recorded as paid' and body like '%Cheque received%') then
    raise exception 'FAIL: the resident was not notified of the payment';
  end if;
  raise notice 'ok: resident notified (compliance)';
end $$;

-- ===========================================================================
-- 2. Municipal reports
-- ===========================================================================
do $$
declare v_result text := pg_get_function_result('public.manager_municipal_reports(uuid)'::regprocedure);
begin
  -- 20261008000005: an area summary. Nothing a reporter could be recognised
  -- by — no description, location, reference, evidence, nor reporter fields.
  if v_result ~* '(reporter|anonymous|ip_hash|latitude|longitude|postal|evidence|description|location|reference)' then
    raise exception 'FAIL: manager_municipal_reports exposes %', v_result;
  end if;
  raise notice 'ok: manager_municipal_reports returns only %', v_result;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform * from public.manager_municipal_reports(current_setting('part_b.building')::uuid);
    raise exception 'FAIL: a non-manager read municipal reports for MCR2026';
  exception when insufficient_privilege then
    raise notice 'ok: non-manager refused municipal reports (42501)';
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare n integer;
begin
  select count(*) into n from public.manager_municipal_reports(current_setting('part_b.building')::uuid);
  raise notice 'ok: manager reads % municipal report(s) for MCR2026', n;
  -- The table itself stays closed to them.
  if exists (select 1 from public.municipal_reports where reporter_id is distinct from auth.uid()) then
    raise exception 'FAIL: a manager can read municipal_reports rows directly';
  end if;
  raise notice 'ok: municipal_reports itself is still unreadable to the manager';

  -- The area is admin-set. Changing the postal code (which a manager may) does
  -- not move it; changing municipality_id is refused.
  perform set_config('part_b.muni_before', n::text, true);
  update public.buildings set postal_code = 'V5H 0A1' where id = current_setting('part_b.building')::uuid;
  select count(*) into n from public.manager_municipal_reports(current_setting('part_b.building')::uuid);
  if n <> current_setting('part_b.muni_before')::int then
    raise exception 'FAIL: editing the postal code changed which reports the manager sees (% -> %)',
      current_setting('part_b.muni_before'), n;
  end if;
  raise notice 'ok: postal code edit does not move the manager''s area';

  begin
    update public.buildings set municipality_id = (select m.id from public.municipalities m
                                                     where m.id is distinct from
                                                       (select b.municipality_id from public.buildings b
                                                         where b.id = current_setting('part_b.building')::uuid)
                                                     limit 1)
     where id = current_setting('part_b.building')::uuid;
    raise exception 'FAIL: a manager changed their building''s municipality';
  exception when insufficient_privilege then
    raise notice 'ok: manager cannot change municipality_id (42501)';
  end;
end $$;
reset role;

-- ===========================================================================
-- 3. Pet document review
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'approve');
  if r->>'error' is distinct from 'forbidden' then
    raise exception 'FAIL: non-manager review returned %', r;
  end if;
  raise notice 'ok: non-manager refused document review (forbidden)';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; n integer;
begin
  -- Still no direct write: since 20261014000001 a manager's UPDATE matches no
  -- row (pet_documents_update admits owner|admin only).
  update public.pet_documents set status = 'approved' where id = current_setting('part_b.doc')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a manager''s direct UPDATE on pet_documents touched % row(s)', n; end if;
  raise notice 'ok: direct UPDATE on pet_documents matches nothing for a manager';

  -- A delete produces no row, so WITH CHECK never saw it (20261014000001).
  delete from public.pet_documents where id = current_setting('part_b.doc')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a manager''s direct DELETE on pet_documents removed % row(s)', n; end if;
  raise notice 'ok: direct DELETE on pet_documents matches nothing for a manager';

  r := public.manager_review_pet_document(current_setting('part_b.doc2')::uuid, 'approve');
  if r->>'error' is distinct from 'no_file' then raise exception 'FAIL: approve without a file returned %', r; end if;
  raise notice 'ok: approve without a file refused (no_file)';

  r := public.manager_review_pet_document(current_setting('part_b.doc2')::uuid, 'reject');
  if r->>'error' is distinct from 'note_required' then raise exception 'FAIL: reject without a note returned %', r; end if;
  raise notice 'ok: reject without a note refused (note_required)';

  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'maybe');
  if r->>'error' is distinct from 'verdict_required' then raise exception 'FAIL: bad verdict returned %', r; end if;
  raise notice 'ok: unknown verdict refused (verdict_required)';

  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'approve');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL: approve returned %', r; end if;
  raise notice 'ok: approve accepted';

  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'approve');
  if r->>'error' is distinct from 'already_reviewed' then raise exception 'FAIL: second approve returned %', r; end if;
  raise notice 'ok: second approve refused (already_reviewed)';

  r := public.manager_review_pet_document(current_setting('part_b.doc2')::uuid, 'reject', 'Please upload the certificate itself.');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL: reject returned %', r; end if;
  raise notice 'ok: reject with a note accepted';
end $$;
reset role;

do $$
begin
  if not exists (select 1 from public.pet_documents
                  where id = current_setting('part_b.doc')::uuid and status = 'approved'
                    and provenance = 'manager_verified'
                    and verified_by = current_setting('part_b.manager')::uuid and verified_at is not null) then
    raise exception 'FAIL: approved document lacks status/provenance/verifier';
  end if;
  raise notice 'ok: approved document carries manager_verified provenance';

  if not exists (select 1 from public.notifications
                  where profile_id = current_setting('part_b.owner')::uuid and kind = 'compliance'
                    and action_target = 'pet-detail:' || current_setting('part_b.pet')
                    and body like '%Please upload the certificate itself.%') then
    raise exception 'FAIL: owner not notified of the rejection';
  end if;
  raise notice 'ok: owner notified of the rejection, with the note and the pet';

  if (select count(*) from public.audit_log
       where entity_id in (current_setting('part_b.doc')::uuid, current_setting('part_b.doc2')::uuid)
         and action in ('pet_document.approved', 'pet_document.rejected')) <> 2 then
    raise exception 'FAIL: expected two pet_document audit rows';
  end if;
  raise notice 'ok: both verdicts audited';
end $$;

-- 3b. Approving a lapsed document is refused.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.manager_review_pet_document(current_setting('part_b.doc3')::uuid, 'approve');
  if r->>'error' is distinct from 'expired' then raise exception 'FAIL: approving a lapsed document returned %', r; end if;
  raise notice 'ok: lapsed document cannot be approved (expired)';
end $$;
reset role;

-- 3c. The owner cannot forge a verdict, and a new file voids the real one.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.owner'), 'role', 'authenticated')::text, true);
do $$
declare v_new uuid;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;

  -- The ordinary upload path (lib/data/live.ts addPetDocument) still works.
  insert into public.pet_documents (pet_id, kind, name, status, storage_path, expires_on)
  values (current_setting('part_b.pet')::uuid, 'other', 'Part B owner upload', 'current', null, null)
  returning id into v_new;
  raise notice 'ok: owner upload with no verdict columns accepted';

  begin
    insert into public.pet_documents (pet_id, kind, name, status)
    values (current_setting('part_b.pet')::uuid, 'other', 'Forged', 'approved');
    raise exception 'FAIL: owner inserted an approved document';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot insert an approved document (42501)';
  end;

  begin
    insert into public.pet_documents (pet_id, kind, name, status, provenance)
    values (current_setting('part_b.pet')::uuid, 'other', 'Forged', 'current', 'clinic_confirmed');
    raise exception 'FAIL: owner inserted a clinic_confirmed document';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot insert a clinic_confirmed document (42501)';
  end;

  begin
    update public.pet_documents set status = 'approved' where id = v_new;
    raise exception 'FAIL: owner approved their own document';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot set status approved (42501)';
  end;

  begin
    update public.pet_documents set provenance = 'manager_verified' where id = v_new;
    raise exception 'FAIL: owner set provenance manager_verified';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot set provenance (42501)';
  end;

  begin
    update public.pet_documents set verified_at = now(), verified_by = auth.uid() where id = v_new;
    raise exception 'FAIL: owner stamped verified_at/verified_by';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot stamp verified_* (42501)';
  end;

  -- The manager approved part_b.doc in section 3. A new file voids that.
  update public.pet_documents set storage_path = storage_path || '.v2'
   where id = current_setting('part_b.doc')::uuid;
  if not exists (select 1 from public.pet_documents
                  where id = current_setting('part_b.doc')::uuid
                    and status = 'current' and provenance = 'self_reported'
                    and verified_by is null and verified_at is null) then
    raise exception 'FAIL: replacing the file kept the manager''s approval';
  end if;
  raise notice 'ok: a replaced file resets status, provenance and verified_*';
end $$;
reset role;

-- ===========================================================================
-- 4. Archiving a building
-- ===========================================================================

-- 4a. Its manager cannot archive it (they may otherwise update the row).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    update public.buildings set archived_at = now() where id = current_setting('part_b.building')::uuid;
    raise exception 'FAIL: a manager archived their own building';
  exception when insufficient_privilege then
    raise notice 'ok: manager cannot archive (42501)';
  end;
end $$;
reset role;

-- 4b. Archived (as the connection role, no JWT — the admin path), the code no
--     longer resolves, and joining and reporting say invalid_code. The claims
--     are cleared first: set_config(..., true) outlives `reset role`, and the
--     guard would otherwise see the manager's uid.
select set_config('request.jwt.claims', '', true);
do $$
begin
  if (public.resolve_building_code('MCR2026')->>'valid')::boolean is distinct from true then
    raise exception 'FIXTURE: MCR2026 does not resolve before archiving';
  end if;
  update public.buildings set archived_at = now() where id = current_setting('part_b.building')::uuid;
  if (public.resolve_building_code('mcr2026')->>'valid')::boolean is distinct from false then
    raise exception 'FAIL: an archived building still resolves by code';
  end if;
  raise notice 'ok: archived building not resolvable by code';

  if public.submit_incident_report('MCR2026', 'noise', 'Part B test')->>'error' is distinct from 'invalid_code' then
    raise exception 'FAIL: an archived building accepted an incident report';
  end if;
  raise notice 'ok: archived building refuses incident reports (invalid_code)';

  if exists (select 1 from public.targetable_buildings() t where t.id = current_setting('part_b.building')::uuid) then
    raise exception 'FAIL: an archived building is still targetable';
  end if;
  raise notice 'ok: archived building not targetable';
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.request_building_link('MCR2026')->>'error' is distinct from 'invalid_code' then
    raise exception 'FAIL: an archived building accepted a join request';
  end if;
  raise notice 'ok: archived building refuses join requests (invalid_code)';
end $$;
reset role;

-- 4c. The guest pet picker no longer resolves it, and a direct pending
--     resident_links insert into it is refused.
select set_config('request.jwt.claims', '', true);
do $$
begin
  if (public.building_pets_for_report('MCR2026')->>'valid')::boolean is distinct from false then
    raise exception 'FAIL: building_pets_for_report still lists an archived building''s pets';
  end if;
  raise notice 'ok: building_pets_for_report refuses an archived building';
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    insert into public.resident_links (profile_id, building_id, status)
    values (auth.uid(), current_setting('part_b.building')::uuid, 'pending');
    raise exception 'FAIL: a direct resident_links insert into an archived building was accepted';
  exception when insufficient_privilege then
    raise notice 'ok: links_insert_self refuses an archived building (42501)';
  end;
end $$;
reset role;

-- 4d. admin_building_history counts cascading tables too: MCR2026 (pets,
--     residents, units…) has history; a building nobody used has none; and a
--     non-admin gets nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.admin'), 'role', 'authenticated')::text, true);
do $$
declare v_used record; v_empty record;
begin
  if not public.is_admin() then raise exception 'FIXTURE: admin is not is_admin()'; end if;
  select * into v_used from public.admin_building_history() h
   where h.building_id = current_setting('part_b.building')::uuid;
  if v_used.total is null or v_used.total = 0 or (v_used.counts->>'pets')::int = 0 then
    raise exception 'FAIL: MCR2026 history %', v_used;
  end if;
  raise notice 'ok: MCR2026 has history (total %, pets %)', v_used.total, v_used.counts->>'pets';
  select * into v_empty from public.admin_building_history() h
   where h.building_id = current_setting('part_b.empty')::uuid;
  if v_empty.total is distinct from 0 then
    raise exception 'FAIL: an unused building reports history %', v_empty;
  end if;
  raise notice 'ok: an unused building has none (only it may be deleted)';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from public.admin_building_history()) then
    raise exception 'FAIL: a manager read admin_building_history';
  end if;
  raise notice 'ok: admin_building_history returns nothing to a non-admin';
end $$;
reset role;

-- ===========================================================================
-- 5. A pet's records: managers read, never write (20261014000001)
-- ===========================================================================
do $$
declare v text;
begin
  select string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ') into v
    from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename in ('care_entries', 'care_targets', 'pet_activity', 'pet_care_tasks',
                       'pet_documents', 'pet_emergency_contacts', 'pet_feeding', 'pet_medications',
                       'pet_photos', 'pet_vaccinations', 'pet_vet_visits')
     and cmd <> 'SELECT'
     and (coalesce(qual, '') like '%manages_building%' or coalesce(with_check, '') like '%manages_building%');
  if v is not null then raise exception 'FAIL: a write policy admits managers: %', v; end if;
  raise notice 'ok: no write policy on a pet''s records admits a manager';
end $$;

rollback;
