-- Pet10x — Part A review fixes: archiving has one door, and practices cannot
-- publish onto a removed pet.
--
-- 1. pets_archive_guard. `pets_owner_write` is FOR ALL, so an owner could
--    UPDATE deleted_at / archived_reason directly — archiving without the
--    share revocation, desk-code deletion and care-task shutdown that
--    owner_archive_pet does in the same breath, or UN-archiving a pet whose
--    shares were already revoked. The constraint from 20261007000001 only
--    keeps the two columns in step; it says nothing about who moves them.
--
--    THE CHOSEN TEST: `current_user`, not a transaction-local token.
--    The guard is SECURITY INVOKER, so `current_user` is the role actually
--    executing the write. A PostgREST request runs as `authenticated` or
--    `anon` — fixed by the JWT, not choosable by the client. Inside
--    owner_archive_pet, which is SECURITY DEFINER and owned by the migration
--    role, `current_user` is that owner. So the rule is exactly:
--
--      a client role (authenticated, anon) may not change these columns,
--      unless is_admin() — pets_admin_all already lets admins correct a pet.
--      Every other role — the definer RPC, service_role, the SQL editor —
--      is already trusted with the whole table.
--
--    Why not the `pet10x.accom_write`-style token the accommodation guard
--    uses: a token is state that must be minted and spent exactly once per
--    write, and its safety rests on no exposed function being able to call
--    set_config for a client. The role test has no state to get wrong and
--    cannot be forged from PostgREST at all. WHAT IT COSTS: any future
--    SECURITY DEFINER function owned by the migration role can write these
--    columns. That is true of every column of every table already; the
--    review of that function is the control, and this note is the reminder.
--
--    INSERT is covered too: a client may not create a pet already archived
--    (which would put an animal straight into an In memory list).
--
-- 2. clinic_publish_record refuses a pet the owner has removed, with
--    `pet_archived` (lib/data/clinic/use-live.ts turns it into a sentence).
--    Copied verbatim from its latest definition (20260901000005_vet_sharing.sql);
--    the only change is the block marked ARCHIVED.

create or replace function public.pets_archive_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.deleted_at is not null or new.archived_reason is not null then
        raise exception 'a pet cannot be created already removed'
          using errcode = '42501',
                detail  = pg_catalog.format('Insert by %s offered deleted_at=%s archived_reason=%s.',
                                            auth.uid(), new.deleted_at, new.archived_reason),
                hint    = 'Create the pet, then call owner_archive_pet(pet, reason) if it should be removed.';
      end if;
    elsif new.deleted_at is distinct from old.deleted_at
       or new.archived_reason is distinct from old.archived_reason then
      raise exception 'pets.deleted_at and archived_reason change only through owner_archive_pet'
        using errcode = '42501',
              detail  = pg_catalog.format('Pet %s by %s: deleted_at %s -> %s, archived_reason %s -> %s.',
                                          old.id, auth.uid(), old.deleted_at, new.deleted_at,
                                          old.archived_reason, new.archived_reason),
              hint    = 'Call owner_archive_pet(pet, reason): it also revokes record shares, deletes open desk codes and stops care reminders. A removal is not reversed by the owner.';
    end if;
  end if;
  return new;
end;
$guard$;

-- A trigger function is attached, never called.
revoke all on function public.pets_archive_guard() from public, anon, authenticated;

comment on function public.pets_archive_guard() is
  'BEFORE INSERT OR UPDATE on pets (20261007000002). A client role (authenticated/anon) that is not is_admin() may not create a pet with deleted_at/archived_reason set, nor change either column — those move only through owner_archive_pet, which runs as its definer and so is not a client role. Tests current_user rather than a token: SECURITY INVOKER, so current_user is the executing role, which PostgREST fixes from the JWT. Raises 42501.';

drop trigger if exists trg_pets_archive_guard on public.pets;
create trigger trg_pets_archive_guard
  before insert or update on public.pets
  for each row execute function public.pets_archive_guard();

create or replace function public.clinic_publish_record(
  p_patient uuid, p_source_kind text, p_source_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cp record; v_pub uuid; v_target uuid; v_title text; v_summary text; v_biz text;
begin
  select * into cp from public.clinic_patients where id = p_patient;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.staff_of_business(cp.business_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not public.can_read_shared_records(cp.business_id) then
    return jsonb_build_object('ok', false, 'error', 'role_not_permitted');
  end if;
  if cp.pet_id is null then return jsonb_build_object('ok', false, 'error', 'not_linked'); end if;
  -- ARCHIVED: the owner removed this pet. Publishing would write a record onto
  -- it and send its owner "New record from …" about an animal they have
  -- removed — for `passed_away`, about one that has died.
  if exists (select 1 from public.pets p where p.id = cp.pet_id and p.deleted_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'pet_archived');
  end if;
  if public.business_tier_of(cp.business_id) <> 'verified' then
    return jsonb_build_object('ok', false, 'error', 'not_verified');
  end if;
  select name into v_biz from public.businesses where id = cp.business_id;

  if p_source_kind = 'vaccination' then
    declare v record;
    begin
      select * into v from public.patient_vaccinations
       where id = p_source_id and business_id = cp.business_id;
      if not found then return jsonb_build_object('ok', false, 'error', 'source_not_found'); end if;

      insert into public.record_publications
        (business_id, patient_id, pet_id, source_kind, source_id, title, summary, published_by)
      values (cp.business_id, cp.id, cp.pet_id, 'vaccination', v.id,
              v.name, 'Given ' || to_char(v.given_on,'DD Mon YYYY') ||
              coalesce(', due ' || to_char(v.expires_on,'DD Mon YYYY'), ''), auth.uid())
      returning id into v_pub;

      insert into public.pet_vaccinations
        (pet_id, name, given_on, expires_on, status, kind, provenance, publication_id, verified_by_business)
      values (cp.pet_id, v.name, v.given_on, v.expires_on,
              case when v.expires_on is null then 'current'
                   when v.expires_on < current_date then 'expired'
                   when v.expires_on < current_date + 30 then 'expiring'
                   else 'current' end::public.doc_status,
              'vaccine', 'clinic_confirmed', v_pub, cp.business_id)
      returning id into v_target;

      update public.record_publications set target_kind = 'pet_vaccination', target_id = v_target
       where id = v_pub;
      v_title := v.name;
    end;

  elsif p_source_kind = 'visit_summary' then
    declare vs record;
    begin
      select * into vs from public.visits where id = p_source_id and business_id = cp.business_id;
      if not found then return jsonb_build_object('ok', false, 'error', 'source_not_found'); end if;
      insert into public.record_publications
        (business_id, patient_id, pet_id, source_kind, source_id, title, summary, published_by)
      values (cp.business_id, cp.id, cp.pet_id, 'visit_summary', vs.id,
              coalesce(vs.reason, 'Visit') || ' — ' || to_char(vs.visited_on, 'DD Mon YYYY'),
              vs.summary, auth.uid())
      returning id into v_pub;
      v_title := coalesce(vs.reason, 'Visit summary');
    end;
  else
    return jsonb_build_object('ok', false, 'error', 'unsupported_kind');
  end if;

  insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
  select p.owner_id, 'clinic', 'success',
         'New record from ' || coalesce(v_biz, 'your vet'),
         coalesce(v_biz,'Your vet') || ' added "' || v_title || '" to ' || p.name || '''s records.',
         'View records', 'my-vets'
    from public.pets p where p.id = cp.pet_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'records.published', 'record_publication', v_pub,
          jsonb_build_object('business_id', cp.business_id, 'pet_id', cp.pet_id, 'kind', p_source_kind));

  return jsonb_build_object('ok', true, 'publication_id', v_pub);
end; $$;
revoke all on function public.clinic_publish_record(uuid, text, uuid) from public, anon;
grant execute on function public.clinic_publish_record(uuid, text, uuid) to authenticated;
