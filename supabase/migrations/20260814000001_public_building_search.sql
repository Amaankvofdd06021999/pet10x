-- "Which building?" for someone with no account.
--
-- A witness on the street knows the building — "the tower on Cambie", "1450
-- Cambie" — and does not know whether it uses Pet10x, let alone its code. The
-- report flow used to open on a bare code field, which asks a stranger to
-- produce the one thing they are least likely to have. Searching first turns
-- that into a recognisable step: find the building, then find its code.
--
-- Returns name and address ONLY. No id, no building_code, no counts, nothing
-- about residents. A name and a street address are already on the door; the
-- code stays the thing that actually authorises a report, and it still comes
-- from a notice in the lobby, never from here. Without the id, a match is
-- confirmation the building is on Pet10x — not a way to join or report.
create or replace function public.search_buildings_public(q text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text; v_rows jsonb;
begin
  v_q := lower(btrim(coalesce(q, '')));

  -- Three characters minimum. Shorter prefixes return most of the table, which
  -- makes this a directory dump rather than a search.
  if length(v_q) < 3 then return jsonb_build_object('matches', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(r order by r->>'name'), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
             'name', b.name,
             'address', b.address,
             'city', b.city,
             'region', b.region,
             'postalCode', b.postal_code
           ) as r
    from public.buildings b
    where lower(coalesce(b.name, '')) like '%' || v_q || '%'
       or lower(coalesce(b.address, '')) like '%' || v_q || '%'
       or upper(replace(coalesce(b.postal_code, ''), ' ', '')) like upper(replace(v_q, ' ', '')) || '%'
    -- Capped hard. A wide query should come back short and unhelpful, not
    -- paginate the whole customer list.
    limit 8
  ) s;

  return jsonb_build_object('matches', v_rows);
end; $$;

revoke all on function public.search_buildings_public(text) from public;
grant execute on function public.search_buildings_public(text) to anon, authenticated;
