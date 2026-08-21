-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- Which municipality covers this location, and who do you actually call?
--
-- Callable by anon: filing a report does not require an account, and the
-- reporter needs to see the contact BEFORE submitting so they know whether
-- Pet10x is even the right place to be.
create or replace function public.resolve_municipality(p_postal text default null, p_lat double precision default null, p_lng double precision default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_row    public.municipalities%rowtype;
begin
  -- First three characters, uppercased, spaces stripped: "v6b 1a1" -> "V6B".
  v_prefix := upper(substr(regexp_replace(coalesce(p_postal, ''), '\s', '', 'g'), 1, 3));

  if v_prefix <> '' then
    select * into v_row from public.municipalities
    where is_active and v_prefix = any (postal_prefixes)
    limit 1;
  end if;

  -- No postal match. Coordinates are accepted and stored, but they are NOT
  -- used to guess a municipality: without a boundary dataset any guess would
  -- be nearest-name-wins, and naming the wrong city on a dog-attack report is
  -- worse than naming none.
  if v_row.id is null then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'id', v_row.id,
    'name', v_row.name,
    'region', v_row.region,
    'phone', v_row.animal_control_phone,
    'url', v_row.animal_control_url,
    'notes', v_row.notes
  );
end;
$$;

revoke all on function public.resolve_municipality(text, double precision, double precision) from public;
grant execute on function public.resolve_municipality(text, double precision, double precision) to anon, authenticated;


-- File a municipal report.
create or replace function public.submit_municipal_report(
  p_type        text,
  p_description text,
  p_postal      text    default null,
  p_lat         double precision default null,
  p_lng         double precision default null,
  p_location    text    default null,
  p_anonymous   boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref  text;
  v_id   uuid;
  v_mun  jsonb;
  v_mid  uuid;
begin
  if coalesce(btrim(p_description), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'description_required');
  end if;

  if p_type not in ('attack_on_pet', 'attack_on_person', 'dangerous_animal', 'animal_at_large') then
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;

  v_mun := public.resolve_municipality(p_postal, p_lat, p_lng);
  if (v_mun->>'found')::boolean then
    v_mid := (v_mun->>'id')::uuid;
  end if;

  v_ref := 'MR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.municipal_reports (
    reporter_id, is_anonymous, type, description,
    postal_code, latitude, longitude, location_text,
    municipality_id, reference_code
  )
  values (
    case when p_anonymous then null else auth.uid() end,
    p_anonymous,
    p_type,
    btrim(p_description),
    nullif(upper(regexp_replace(coalesce(p_postal, ''), '\s', '', 'g')), ''),
    p_lat, p_lng,
    nullif(btrim(coalesce(p_location, '')), ''),
    v_mid,
    v_ref
  )
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'municipal_report.submitted', 'municipal_report', v_id,
          jsonb_build_object('type', p_type, 'reference', v_ref, 'municipality_matched', v_mid is not null));

  -- The contact comes back with the reference so the confirmation screen can
  -- tell them where to actually file. That is the whole value of this path.
  return jsonb_build_object('ok', true, 'reference', v_ref, 'municipality', v_mun);
end;
$$;

revoke all on function public.submit_municipal_report(text, text, text, double precision, double precision, text, boolean) from public;
grant execute on function public.submit_municipal_report(text, text, text, double precision, double precision, text, boolean) to anon, authenticated;
