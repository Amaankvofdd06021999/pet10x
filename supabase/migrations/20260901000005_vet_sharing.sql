-- Pet10x — Veterinary platform, part 5 of 6: sharing and attestation.
--
-- Two narrow bridges between the owner's records and the practice's:
--
--   record_shares       the owner opens a scoped, expiring, revocable window
--   record_publications the practice hands a record back, and it carries the
--                       practice's name in the owner's app
--
-- Shared data is NOT exposed through row-level policies on the owner's tables.
-- It is reachable only through clinic_fetch_shared_record(), which checks the
-- grant and writes an access-log row in the same breath. That is deliberate:
-- it makes "every read is logged" true by construction rather than by
-- everyone remembering.
--
-- Revoking stops future reads. It does not reach into the practice's own
-- records, because those were never the owner's to withdraw.

-- Provenance: a record can now say where it came from.
alter table public.pet_vaccinations
  add column if not exists provenance text not null default 'self_reported',
  add column if not exists publication_id uuid,
  add column if not exists verified_by_business uuid references public.businesses(id) on delete set null;
alter table public.pet_documents
  add column if not exists provenance text not null default 'self_reported',
  add column if not exists publication_id uuid,
  add column if not exists verified_by_business uuid references public.businesses(id) on delete set null;

alter table public.pet_vaccinations drop constraint if exists pet_vax_provenance_ck;
alter table public.pet_vaccinations add constraint pet_vax_provenance_ck
  check (provenance in ('self_reported','clinic_confirmed','manager_verified'));
alter table public.pet_documents drop constraint if exists pet_docs_provenance_ck;
alter table public.pet_documents add constraint pet_docs_provenance_ck
  check (provenance in ('self_reported','clinic_confirmed','manager_verified'));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
create table if not exists public.record_shares (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  granted_by uuid not null references public.profiles(id) on delete cascade,
  scopes text[] not null default '{identity,vaccinations,health_notes}',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  created_via text not null default 'manual'
    check (created_via in ('manual','booking','desk_code','request')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists record_shares_pet_idx on public.record_shares(pet_id);
create index if not exists record_shares_business_idx on public.record_shares(business_id);
create unique index if not exists record_shares_active_uniq
  on public.record_shares(pet_id, business_id) where revoked_at is null;

create table if not exists public.record_share_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  patient_id uuid references public.clinic_patients(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  scopes text[] not null default '{identity,vaccinations,health_notes}',
  message text,
  status text not null default 'pending'
    check (status in ('pending','approved','refused','cancelled','expired')),
  requested_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rsr_profile_idx on public.record_share_requests(profile_id) where status = 'pending';
create index if not exists rsr_business_idx on public.record_share_requests(business_id);

-- A code the owner reads out at reception. Single use, ten minutes.
create table if not exists public.record_desk_codes (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  scopes text[] not null default '{identity,vaccinations,health_notes}',
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  redeemed_at timestamptz,
  redeemed_by_business uuid references public.businesses(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists desk_codes_open_idx on public.record_desk_codes(code) where redeemed_at is null;

create table if not exists public.record_access_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_profile_id uuid references public.profiles(id) on delete set null,
  pet_id uuid references public.pets(id) on delete set null,
  patient_id uuid references public.clinic_patients(id) on delete set null,
  scopes text[] not null default '{}',
  basis text not null default 'share' check (basis in ('share','emergency')),
  occurred_at timestamptz not null default now()
);
create index if not exists ral_business_idx on public.record_access_log(business_id, occurred_at desc);
create index if not exists ral_pet_idx on public.record_access_log(pet_id, occurred_at desc);

create table if not exists public.record_publications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  patient_id uuid not null references public.clinic_patients(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  source_kind text not null check (source_kind in ('vaccination','visit_summary','document')),
  source_id uuid,
  target_kind text,
  target_id uuid,
  title text not null,
  summary text,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rpub_pet_idx on public.record_publications(pet_id, published_at desc);
create index if not exists rpub_business_idx on public.record_publications(business_id);
create unique index if not exists rpub_source_uniq
  on public.record_publications(business_id, source_kind, source_id)
  where source_id is not null and withdrawn_at is null;

drop trigger if exists trg_record_shares_updated on public.record_shares;
create trigger trg_record_shares_updated before update on public.record_shares
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The predicate. A practice must be verified, the staff member must have
-- clinical need-to-know, and the grant must be live and cover the scope.
-- ---------------------------------------------------------------------------
create or replace function public.clinic_may_read(p_pet uuid, p_scope text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.record_shares s
     where s.pet_id = p_pet
       and s.revoked_at is null
       and s.starts_at <= now()
       and (s.expires_at is null or s.expires_at > now())
       and p_scope = any(s.scopes)
       and public.staff_of_business(s.business_id)
       and public.can_read_shared_records(s.business_id)
       and public.business_tier_of(s.business_id) = 'verified'
  );
$$;

-- The only way in. Returns what the grant covers, and logs the read.
create or replace function public.clinic_fetch_shared_record(p_patient uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cp record; sh record; out jsonb := '{}'::jsonb; granted text[] := '{}';
begin
  select * into cp from public.clinic_patients where id = p_patient;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.staff_of_business(cp.business_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if cp.pet_id is null then
    return jsonb_build_object('ok', true, 'linked', false, 'scopes', '[]'::jsonb);
  end if;
  if not public.can_read_shared_records(cp.business_id) then
    return jsonb_build_object('ok', false, 'error', 'role_not_permitted');
  end if;

  select * into sh from public.record_shares s
   where s.pet_id = cp.pet_id and s.business_id = cp.business_id
     and s.revoked_at is null and s.starts_at <= now()
     and (s.expires_at is null or s.expires_at > now())
   limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'linked', true, 'shared', false, 'scopes', '[]'::jsonb);
  end if;
  if public.business_tier_of(cp.business_id) <> 'verified' then
    return jsonb_build_object('ok', false, 'error', 'not_verified');
  end if;

  if 'identity' = any(sh.scopes) then
    granted := granted || 'identity';
    out := out || jsonb_build_object('identity', (
      select jsonb_build_object('name', p.name, 'species', p.species, 'breed', p.breed,
        'sex', p.sex, 'dob', p.dob, 'colour', p.color, 'microchip', p.microchip,
        'weight_grams', p.weight_grams, 'neutered', p.neutered, 'status', p.status)
      from public.pets p where p.id = cp.pet_id));
  end if;

  if 'health_notes' = any(sh.scopes) then
    granted := granted || 'health_notes';
    out := out || jsonb_build_object('health', (
      select jsonb_build_object('allergies', p.allergies, 'conditions', p.conditions,
        'medications_notes', p.medications_notes, 'behavioral_notes', p.behavioral_notes,
        'vet_clinic', p.vet_clinic, 'vet_name', p.vet_name, 'vet_phone', p.vet_phone)
      from public.pets p where p.id = cp.pet_id));
  end if;

  if 'vaccinations' = any(sh.scopes) then
    granted := granted || 'vaccinations';
    out := out || jsonb_build_object('vaccinations', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'given_on', v.given_on,
        'expires_on', v.expires_on, 'status', v.status, 'provenance', v.provenance)
        order by v.expires_on desc nulls last)
      from public.pet_vaccinations v where v.pet_id = cp.pet_id), '[]'::jsonb));
  end if;

  if 'documents' = any(sh.scopes) then
    granted := granted || 'documents';
    out := out || jsonb_build_object('documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'name', d.name,
        'status', d.status, 'expires_on', d.expires_on, 'provenance', d.provenance)
        order by d.created_at desc)
      from public.pet_documents d where d.pet_id = cp.pet_id), '[]'::jsonb));
  end if;

  if 'care_log' = any(sh.scopes) then
    granted := granted || 'care_log';
    out := out || jsonb_build_object('care_log', coalesce((
      select jsonb_agg(jsonb_build_object('kind', e.kind, 'label', e.label, 'amount', e.amount,
        'unit', e.unit, 'logged_at', e.logged_at) order by e.logged_at desc)
      from (select * from public.care_entries where pet_id = cp.pet_id
             order by logged_at desc limit 50) e), '[]'::jsonb));
  end if;

  if 'other_clinic_records' = any(sh.scopes) then
    granted := granted || 'other_clinic_records';
    out := out || jsonb_build_object('other_clinic_records', coalesce((
      select jsonb_agg(jsonb_build_object('business', b.name, 'title', rp.title,
        'summary', rp.summary, 'published_at', rp.published_at) order by rp.published_at desc)
      from public.record_publications rp join public.businesses b on b.id = rp.business_id
      where rp.pet_id = cp.pet_id and rp.withdrawn_at is null
        and rp.business_id <> cp.business_id), '[]'::jsonb));
  end if;

  insert into public.record_access_log (business_id, staff_profile_id, pet_id, patient_id, scopes, basis)
  values (cp.business_id, auth.uid(), cp.pet_id, cp.id, granted, 'share');

  return jsonb_build_object('ok', true, 'linked', true, 'shared', true,
    'scopes', to_jsonb(granted), 'expires_at', sh.expires_at, 'data', out);
end; $$;
revoke all on function public.clinic_fetch_shared_record(uuid) from public, anon;
grant execute on function public.clinic_fetch_shared_record(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Owner actions
-- ---------------------------------------------------------------------------
create or replace function public.owner_grant_record_share(
  p_pet uuid, p_business uuid, p_scopes text[] default null,
  p_expires_at timestamptz default null, p_via text default 'manual')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_scopes text[];
begin
  if not exists (select 1 from public.pets where id = p_pet and owner_id = auth.uid() and deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'not_your_pet');
  end if;
  if public.business_tier_of(p_business) <> 'verified' then
    return jsonb_build_object('ok', false, 'error', 'clinic_not_verified');
  end if;
  v_scopes := coalesce(p_scopes, array['identity','vaccinations','health_notes']);
  if exists (select 1 from unnest(v_scopes) s
             where s not in ('identity','vaccinations','health_notes','documents','care_log','other_clinic_records')) then
    return jsonb_build_object('ok', false, 'error', 'bad_scope');
  end if;

  insert into public.record_shares (pet_id, business_id, granted_by, scopes, expires_at, created_via)
  values (p_pet, p_business, auth.uid(), v_scopes, p_expires_at, p_via)
  on conflict (pet_id, business_id) where revoked_at is null
  do update set scopes = excluded.scopes, expires_at = excluded.expires_at, updated_at = now()
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'records.shared', 'record_share', v_id,
          jsonb_build_object('business_id', p_business, 'pet_id', p_pet, 'scopes', v_scopes));
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
revoke all on function public.owner_grant_record_share(uuid, uuid, text[], timestamptz, text) from public, anon;
grant execute on function public.owner_grant_record_share(uuid, uuid, text[], timestamptz, text) to authenticated;

create or replace function public.owner_revoke_record_share(p_share uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s record;
begin
  select * into s from public.record_shares where id = p_share;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not exists (select 1 from public.pets where id = s.pet_id and owner_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  update public.record_shares set revoked_at = now(), revoked_by = auth.uid() where id = p_share;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'records.share_revoked', 'record_share', p_share,
          jsonb_build_object('business_id', s.business_id, 'pet_id', s.pet_id));
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.owner_revoke_record_share(uuid) from public, anon;
grant execute on function public.owner_revoke_record_share(uuid) to authenticated;

create or replace function public.owner_create_desk_code(p_pet uuid, p_scopes text[] default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text; v_try integer := 0;
begin
  if not exists (select 1 from public.pets where id = p_pet and owner_id = auth.uid() and deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'not_your_pet');
  end if;
  loop
    v_try := v_try + 1;
    v_code := upper(substr(replace(encode(gen_random_bytes(6), 'base64'), '/', ''), 1, 6));
    v_code := translate(v_code, '+=OI01', 'XYZWKM');
    exit when not exists (select 1 from public.record_desk_codes where code = v_code) or v_try > 8;
  end loop;
  delete from public.record_desk_codes
   where pet_id = p_pet and redeemed_at is null and expires_at < now();
  insert into public.record_desk_codes (pet_id, profile_id, code, scopes)
  values (p_pet, auth.uid(), v_code,
          coalesce(p_scopes, array['identity','vaccinations','health_notes']));
  return jsonb_build_object('ok', true, 'code', v_code, 'expires_in_minutes', 10);
end; $$;
revoke all on function public.owner_create_desk_code(uuid, text[]) from public, anon;
grant execute on function public.owner_create_desk_code(uuid, text[]) to authenticated;

create or replace function public.owner_decide_share_request(p_request uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; res jsonb;
begin
  select * into r from public.record_share_requests where id = p_request for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.profile_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'already_decided'); end if;
  if not p_approve then
    update public.record_share_requests set status = 'refused', decided_at = now() where id = p_request;
    return jsonb_build_object('ok', true, 'status', 'refused');
  end if;
  res := public.owner_grant_record_share(r.pet_id, r.business_id, r.scopes, null, 'request');
  if (res->>'ok')::boolean is not true then return res; end if;
  update public.record_share_requests set status = 'approved', decided_at = now() where id = p_request;
  return jsonb_build_object('ok', true, 'status', 'approved');
end; $$;
revoke all on function public.owner_decide_share_request(uuid, boolean) from public, anon;
grant execute on function public.owner_decide_share_request(uuid, boolean) to authenticated;

create or replace function public.owner_unlink_patient(p_patient uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  select cp.id, cp.business_id, cp.pet_id, p.owner_id into r
    from public.clinic_patients cp join public.pets p on p.id = cp.pet_id
   where cp.id = p_patient;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.owner_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  update public.record_shares set revoked_at = now(), revoked_by = auth.uid()
   where pet_id = r.pet_id and business_id = r.business_id and revoked_at is null;
  update public.clinic_patients set pet_id = null where id = p_patient;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.owner_unlink_patient(uuid) from public, anon;
grant execute on function public.owner_unlink_patient(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Clinic actions
-- ---------------------------------------------------------------------------
create or replace function public.clinic_redeem_desk_code(p_business uuid, p_code text, p_patient uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare dc record; res jsonb; v_pet uuid;
begin
  if not public.staff_of_business(p_business) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if public.business_tier_of(p_business) <> 'verified' then
    return jsonb_build_object('ok', false, 'error', 'not_verified');
  end if;
  select * into dc from public.record_desk_codes
   where upper(code) = upper(btrim(p_code)) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  if dc.redeemed_at is not null then return jsonb_build_object('ok', false, 'error', 'already_used'); end if;
  if dc.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;

  insert into public.record_shares (pet_id, business_id, granted_by, scopes, created_via)
  values (dc.pet_id, p_business, dc.profile_id, dc.scopes, 'desk_code')
  on conflict (pet_id, business_id) where revoked_at is null
  do update set scopes = excluded.scopes, updated_at = now();

  update public.record_desk_codes
     set redeemed_at = now(), redeemed_by_business = p_business where id = dc.id;

  if p_patient is not null then
    update public.clinic_patients set pet_id = dc.pet_id
     where id = p_patient and business_id = p_business and pet_id is null;
  end if;

  select dc.pet_id into v_pet;
  return jsonb_build_object('ok', true, 'pet_id', v_pet);
end; $$;
revoke all on function public.clinic_redeem_desk_code(uuid, text, uuid) from public, anon;
grant execute on function public.clinic_redeem_desk_code(uuid, text, uuid) to authenticated;

-- Handing a record back. Explicit, never automatic.
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

create or replace function public.clinic_withdraw_publication(p_publication uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare rp record;
begin
  select * into rp from public.record_publications where id = p_publication;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.staff_of_business(rp.business_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  update public.record_publications
     set withdrawn_at = now(), withdrawn_by = auth.uid() where id = p_publication;
  if rp.target_kind = 'pet_vaccination' and rp.target_id is not null then
    delete from public.pet_vaccinations where id = rp.target_id and publication_id = p_publication;
  end if;
  insert into public.notifications (profile_id, kind, severity, title, body, action_target)
  select p.owner_id, 'clinic', 'warning', 'A record was withdrawn',
         'A record previously added to ' || p.name || '''s file has been withdrawn by the practice.' ||
         coalesce(' Reason: ' || p_reason, ''), 'my-vets'
    from public.pets p where p.id = rp.pet_id;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.clinic_withdraw_publication(uuid, text) from public, anon;
grant execute on function public.clinic_withdraw_publication(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS. Note there is deliberately NO policy granting clinics read access to
-- pets or pet_vaccinations; that route is the logging RPC above.
-- ---------------------------------------------------------------------------
alter table public.record_shares enable row level security;
alter table public.record_share_requests enable row level security;
alter table public.record_desk_codes enable row level security;
alter table public.record_access_log enable row level security;
alter table public.record_publications enable row level security;

drop policy if exists rshare_owner on public.record_shares;
create policy rshare_owner on public.record_shares for select
  using (exists (select 1 from public.pets p where p.id = pet_id and p.owner_id = auth.uid()));
drop policy if exists rshare_clinic on public.record_shares;
create policy rshare_clinic on public.record_shares for select
  using (public.staff_of_business(business_id) or public.is_admin());

drop policy if exists rsr_owner on public.record_share_requests;
create policy rsr_owner on public.record_share_requests for select using (profile_id = auth.uid());
drop policy if exists rsr_clinic on public.record_share_requests;
create policy rsr_clinic on public.record_share_requests for all
  using (public.staff_of_business(business_id) or public.is_admin())
  with check (public.staff_of_business(business_id) or public.is_admin());

drop policy if exists desk_owner on public.record_desk_codes;
create policy desk_owner on public.record_desk_codes for select using (profile_id = auth.uid());

drop policy if exists ral_clinic on public.record_access_log;
create policy ral_clinic on public.record_access_log for select
  using (public.can_admin_business(business_id) or public.is_admin());
drop policy if exists ral_owner on public.record_access_log;
create policy ral_owner on public.record_access_log for select
  using (exists (select 1 from public.pets p where p.id = pet_id and p.owner_id = auth.uid()));

drop policy if exists rpub_owner on public.record_publications;
create policy rpub_owner on public.record_publications for select
  using (exists (select 1 from public.pets p where p.id = pet_id and p.owner_id = auth.uid()));
drop policy if exists rpub_clinic on public.record_publications;
create policy rpub_clinic on public.record_publications for select
  using (public.staff_of_business(business_id) or public.is_admin());
