-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- Pet10x — token-gated emergency directory (PRD §6.8).
--
-- First responders are anonymous: no account, no session. RLS therefore blocks
-- them from reading emergency_access_tokens and pets outright. This function is
-- the single, narrow door: it validates the token itself, logs the access, and
-- returns ONLY the fields the PRD permits — pet name, species, presence,
-- handling notes, one emergency phone, and floor/unit.
--
-- Deliberately NOT returned: owner identity, medical history, billing,
-- documents, compliance. "No personal owner information in summary view."
create or replace function public.emergency_directory(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tok    record;
  v_result jsonb;
begin
  -- A token is only good if it exists, hasn't been revoked, and hasn't expired.
  -- Revoking one takes effect immediately: the next load fails this check.
  select t.id, t.building_id, t.expires_at
    into v_tok
  from public.emergency_access_tokens t
  where t.token = p_token
    and not t.revoked
    and t.expires_at > now();

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  -- "All access logged" (PRD §6.8 Access & Security).
  insert into public.audit_log (action, entity_type, entity_id, building_id, metadata)
  values ('emergency_directory.viewed', 'emergency_access_token', v_tok.id, v_tok.building_id,
          jsonb_build_object('viewed_at', now()));

  select jsonb_build_object(
    'valid', true,
    'expires_at', v_tok.expires_at,
    'building', jsonb_build_object('name', b.name, 'address', b.address),
    'totals', (
      select jsonb_build_object(
        'total', count(*),
        'dogs',  count(*) filter (where p.species = 'dog'),
        'cats',  count(*) filter (where p.species = 'cat'),
        'other', count(*) filter (where p.species not in ('dog','cat'))
      )
      from public.pets p
      where p.building_id = v_tok.building_id and p.deleted_at is null
    ),
    'floors', coalesce((
      select jsonb_agg(f order by f->>'floor')
      from (
        select jsonb_build_object(
          'floor', coalesce(u.floor, 0),
          'units', jsonb_agg(
            jsonb_build_object(
              'unit', u.unit_number,
              'pets', (
                select jsonb_agg(
                  jsonb_build_object(
                    'name',    p.name,
                    'species', p.species,
                    -- Presence, from the pet's own status (PRD: "unit-level pet
                    -- presence indicator (based on status)").
                    'present', p.status = 'home',
                    'status',  p.status,
                    'notes',   nullif(trim(coalesce(p.behavioral_notes,'') || ' ' || coalesce(p.conditions,'')), ''),
                    -- One phone. Prefer a named emergency contact; fall back to
                    -- the vet. Never the owner's identity.
                    'emergency', coalesce(
                      (select ec.phone from public.pet_emergency_contacts ec
                        where ec.pet_id = p.id and ec.phone is not null
                        order by ec.sort_order nulls last limit 1),
                      p.vet_phone
                    )
                  ) order by p.name
                )
                from public.pets p
                where p.unit_id = u.id and p.deleted_at is null
              )
            ) order by u.unit_number
          )
        ) as f
        from public.units u
        where u.building_id = v_tok.building_id
          and exists (select 1 from public.pets p
                       where p.unit_id = u.id and p.deleted_at is null)
        group by coalesce(u.floor, 0)
      ) grouped
    ), '[]'::jsonb)
  )
  into v_result
  from public.buildings b
  where b.id = v_tok.building_id;

  return v_result;
end;
$$;

-- The whole point is that a signed-out first responder can call this.
-- Safety rests on the token check inside the function, not on the caller.
revoke all on function public.emergency_directory(text) from public;
grant execute on function public.emergency_directory(text) to anon, authenticated;
