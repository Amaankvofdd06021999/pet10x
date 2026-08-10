-- Report a pet by picture, not by unit number.
--
-- The guest form asked a stranger to type "Unit involved" — handing out a
-- resident's home address in exchange for a code printed in the lobby, and
-- asking the reporter for something they usually do not know. What a witness
-- DOES know is what the animal looked like.

alter table public.incident_reports
  add column if not exists pet_id uuid references public.pets(id) on delete set null;

create index if not exists incident_reports_pet_idx on public.incident_reports (pet_id);

comment on column public.incident_reports.pet_id is
  'The pet the reporter picked from photos. unit_involved is retained for manager-entered and historical rows; guests no longer supply it.';

-- Only what identifies an animal on sight. Deliberately narrower than
-- emergency_directory(), which DOES expose units — that one needs a revocable,
-- expiring token and writes an audit row. A building code is on a noticeboard,
-- never expires, and anyone can hold it.
create or replace function public.building_pets_for_report(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_building uuid; v_pets jsonb;
begin
  select b.id into v_building from public.buildings b
  where upper(b.building_code) = upper(btrim(p_code));

  if v_building is null then return jsonb_build_object('valid', false); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'species', p.species, 'breed', p.breed,
           'photo', coalesce(p.image_url,
                      (select ph.path from public.pet_photos ph
                        where ph.pet_id = p.id order by ph.sort_order limit 1))
         ) order by p.name), '[]'::jsonb)
    into v_pets
  from public.pets p
  where p.building_id = v_building and p.deleted_at is null;

  return jsonb_build_object('valid', true, 'pets', v_pets);
end; $$;

-- anon on purpose: filing an incident does not require an account.
revoke all on function public.building_pets_for_report(text) from public;
grant execute on function public.building_pets_for_report(text) to anon, authenticated;
