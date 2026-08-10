-- "Your building is already on Pet10x — do you have a code?"
--
-- Returns the building NAME and nothing else. The caller is not a member: they
-- have typed an address that happens to match. Returning the id, code or
-- anything about residents would turn a postal code into a directory lookup.
-- The code itself never comes from here — it comes from their manager.
create or replace function public.buildings_matching_my_address()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_postal text; v_street text; v_names text[];
begin
  if auth.uid() is null then return jsonb_build_object('matches', '[]'::jsonb); end if;

  select upper(replace(coalesce(postal_code,''),' ','')), lower(btrim(coalesce(street_address,'')))
    into v_postal, v_street from public.profiles where id = auth.uid();

  -- Postal code required. Street alone is far too loose and city would suggest
  -- a building to everyone in Vancouver.
  if v_postal = '' then return jsonb_build_object('matches', '[]'::jsonb); end if;

  select coalesce(array_agg(b.name order by b.name), '{}') into v_names
  from public.buildings b
  where upper(replace(coalesce(b.postal_code,''),' ','')) = v_postal
    and (v_street = '' or lower(btrim(coalesce(b.address,''))) like '%' || split_part(v_street,' ',1) || '%');

  return jsonb_build_object('matches', to_jsonb(v_names));
end; $$;

revoke all on function public.buildings_matching_my_address() from public, anon;
grant execute on function public.buildings_matching_my_address() to authenticated;
