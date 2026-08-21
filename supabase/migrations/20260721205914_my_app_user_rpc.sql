-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- Sign-in resolved the app user with four separate PostgREST round trips. On a
-- high-latency link (users are far from the DB region) that is four chances to
-- stall before the shell can paint. One round trip instead.
-- security invoker: RLS still scopes every table read to the caller.
create or replace function public.my_app_user()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'role',           p.role,
    'full_name',      p.full_name,
    'email',          p.email,
    'avatar_url',     p.avatar_url,
    'member_since',   p.member_since,
    'plan_label',     p.plan_label,
    'onboarded',      p.onboarded,
    'is_super_admin', p.is_super_admin,
    'is_suspended',   p.is_suspended,
    'pet_count',      (select count(*) from public.pets pe
                        where pe.owner_id = p.id and pe.deleted_at is null),
    'building',       coalesce(
      (select jsonb_build_object('name', b.name, 'unit', u.unit_number)
         from public.resident_links rl
         join public.buildings b on b.id = rl.building_id
         left join public.units u on u.id = rl.unit_id
        where rl.profile_id = p.id and rl.status = 'approved'
        limit 1),
      (select jsonb_build_object('name', b.name, 'unit', null)
         from public.building_managers bm
         join public.buildings b on b.id = bm.building_id
        where bm.profile_id = p.id
        order by bm.is_primary desc
        limit 1)
    )
  )
  from public.profiles p
  where p.id = auth.uid();
$$;
grant execute on function public.my_app_user() to authenticated;
