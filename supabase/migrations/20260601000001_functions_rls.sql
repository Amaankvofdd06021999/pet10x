-- Pet10x — Phase 1 functions, entitlements, triggers, RLS, storage

-- ===========================================================================
-- Role / scope helper predicates (security definer so policies stay readable)
-- ===========================================================================
create or replace function public.auth_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.manages_building(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.building_managers bm
                 where bm.building_id = b and bm.profile_id = auth.uid());
$$;

create or replace function public.is_resident_of(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.resident_links rl
                 where rl.building_id = b and rl.profile_id = auth.uid()
                   and rl.status = 'approved');
$$;

-- ===========================================================================
-- Entitlements — the single source of truth for "is this user premium?"
--   premium = active individual sub OR approved building sponsorship
-- ===========================================================================
create or replace function public.resolve_entitlement(p_user uuid)
returns entitlement_source language sql stable security definer set search_path = public as $$
  select 'building_sponsored'::entitlement_source
  from public.sponsored_seats ss
  join public.building_subscriptions bs on bs.id = ss.building_subscription_id
  where ss.profile_id = p_user and ss.active
    and bs.status in ('trialing','active','past_due')
  union all
  select s.source
  from public.subscriptions s
  where s.profile_id = p_user and s.status in ('trialing','active','past_due')
  limit 1;
$$;

create or replace function public.is_premium(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.resolve_entitlement(p_user) is not null;
$$;

create view public.user_entitlements with (security_invoker = true) as
  select p.id as profile_id,
         public.resolve_entitlement(p.id) as source,
         public.resolve_entitlement(p.id) is not null as is_premium
  from public.profiles p;

-- ===========================================================================
-- Auth → profile provisioning + privilege guard
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stop users from elevating their own role / admin flag.
create or replace function public.guard_profile_privilege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only block authenticated, non-admin users. Service role / SQL (auth.uid()
  -- is null) and super admins may change roles.
  if (new.role is distinct from old.role
      or new.is_super_admin is distinct from old.is_super_admin)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Not allowed to change role or admin flag';
  end if;
  return new;
end;
$$;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_privilege();

-- ===========================================================================
-- Enable RLS everywhere (default-deny; policies below open the minimum)
-- ===========================================================================
alter table public.profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.units enable row level security;
alter table public.building_managers enable row level security;
alter table public.resident_links enable row level security;
alter table public.pets enable row level security;
alter table public.pet_documents enable row level security;
alter table public.pet_vaccinations enable row level security;
alter table public.pet_emergency_contacts enable row level security;
alter table public.pet_activity enable row level security;
alter table public.pet_care_tasks enable row level security;
alter table public.pet_care_log enable row level security;
alter table public.pet_feeding enable row level security;
alter table public.pet_medications enable row level security;
alter table public.incident_reports enable row level security;
alter table public.violations enable row level security;
alter table public.violation_events enable row level security;
alter table public.accommodation_requests enable row level security;
alter table public.accommodation_documents enable row level security;
alter table public.community_posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_comments enable row level security;
alter table public.lost_found enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.businesses enable row level security;
alter table public.business_listings enable row level security;
alter table public.billing_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.building_subscriptions enable row level security;
alter table public.sponsored_seats enable row level security;
alter table public.fines enable row level security;
alter table public.payments enable row level security;
alter table public.service_bookings enable row level security;
alter table public.payouts enable row level security;
alter table public.payout_items enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.emergency_access_tokens enable row level security;
alter table public.audit_log enable row level security;

-- ===========================================================================
-- Policies — identity / org
-- ===========================================================================
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or public.is_admin()
  or exists (select 1 from public.resident_links rl
             where rl.profile_id = profiles.id and public.manages_building(rl.building_id))
);
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy buildings_select on public.buildings for select using (
  public.is_resident_of(id) or public.manages_building(id) or public.is_admin()
);
create policy buildings_manager_update on public.buildings for update using (public.manages_building(id)) with check (public.manages_building(id));
create policy buildings_admin_all on public.buildings for all using (public.is_admin()) with check (public.is_admin());

create policy units_select on public.units for select using (
  public.is_resident_of(building_id) or public.manages_building(building_id) or public.is_admin()
);
create policy units_manager_write on public.units for all
  using (public.manages_building(building_id) or public.is_admin())
  with check (public.manages_building(building_id) or public.is_admin());

create policy bm_select on public.building_managers for select using (
  profile_id = auth.uid() or public.manages_building(building_id) or public.is_admin()
);
create policy bm_admin_all on public.building_managers for all using (public.is_admin()) with check (public.is_admin());

create policy links_select on public.resident_links for select using (
  profile_id = auth.uid() or public.manages_building(building_id) or public.is_admin()
);
create policy links_insert_self on public.resident_links for insert with check (profile_id = auth.uid() and status = 'pending');
create policy links_manager_update on public.resident_links for update
  using (public.manages_building(building_id) or public.is_admin())
  with check (public.manages_building(building_id) or public.is_admin());
create policy links_admin_all on public.resident_links for all using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- Policies — pets + children
-- ===========================================================================
create policy pets_select on public.pets for select using (
  owner_id = auth.uid() or public.manages_building(building_id) or public.is_admin()
);
create policy pets_owner_write on public.pets for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pets_admin_all on public.pets for all using (public.is_admin()) with check (public.is_admin());

-- child tables: read = owner|manager|admin ; write = owner|admin (managers read-only)
create policy pet_documents_rw on public.pet_documents for all using (
  exists (select 1 from public.pets p where p.id = pet_documents.pet_id
          and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin()))
) with check (
  exists (select 1 from public.pets p where p.id = pet_documents.pet_id
          and (p.owner_id = auth.uid() or public.is_admin())));

create policy pet_vaccinations_rw on public.pet_vaccinations for all using (
  exists (select 1 from public.pets p where p.id = pet_vaccinations.pet_id
          and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin()))
) with check (
  exists (select 1 from public.pets p where p.id = pet_vaccinations.pet_id
          and (p.owner_id = auth.uid() or public.is_admin())));

create policy pet_emergency_contacts_rw on public.pet_emergency_contacts for all using (
  exists (select 1 from public.pets p where p.id = pet_emergency_contacts.pet_id
          and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin()))
) with check (
  exists (select 1 from public.pets p where p.id = pet_emergency_contacts.pet_id
          and (p.owner_id = auth.uid() or public.is_admin())));

create policy pet_activity_rw on public.pet_activity for all using (
  exists (select 1 from public.pets p where p.id = pet_activity.pet_id
          and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin()))
) with check (
  exists (select 1 from public.pets p where p.id = pet_activity.pet_id
          and (p.owner_id = auth.uid() or public.is_admin())));

create policy pet_care_tasks_rw on public.pet_care_tasks for all using (
  exists (select 1 from public.pets p where p.id = pet_care_tasks.pet_id
          and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin()))
) with check (
  exists (select 1 from public.pets p where p.id = pet_care_tasks.pet_id
          and (p.owner_id = auth.uid() or public.is_admin())));

create policy pet_feeding_rw on public.pet_feeding for all using (
  exists (select 1 from public.pets p where p.id = pet_feeding.pet_id
          and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin()))
) with check (
  exists (select 1 from public.pets p where p.id = pet_feeding.pet_id
          and (p.owner_id = auth.uid() or public.is_admin())));

create policy pet_medications_rw on public.pet_medications for all using (
  exists (select 1 from public.pets p where p.id = pet_medications.pet_id
          and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin()))
) with check (
  exists (select 1 from public.pets p where p.id = pet_medications.pet_id
          and (p.owner_id = auth.uid() or public.is_admin())));

create policy pet_care_log_rw on public.pet_care_log for all using (
  exists (select 1 from public.pet_care_tasks ct join public.pets p on p.id = ct.pet_id
          where ct.id = pet_care_log.task_id and (p.owner_id = auth.uid() or public.is_admin()))
) with check (
  exists (select 1 from public.pet_care_tasks ct join public.pets p on p.id = ct.pet_id
          where ct.id = pet_care_log.task_id and (p.owner_id = auth.uid() or public.is_admin()))
);

-- ===========================================================================
-- Policies — governance
-- ===========================================================================
create policy incidents_select on public.incident_reports for select using (
  public.manages_building(building_id) or public.is_admin() or reporter_id = auth.uid()
);
create policy incidents_insert_auth on public.incident_reports for insert with check (reporter_id = auth.uid());
create policy incidents_manager_update on public.incident_reports for update
  using (public.manages_building(building_id) or public.is_admin())
  with check (public.manages_building(building_id) or public.is_admin());

create policy violations_select on public.violations for select using (
  public.manages_building(building_id) or public.is_admin() or resident_id = auth.uid()
);
create policy violations_manager_write on public.violations for all
  using (public.manages_building(building_id) or public.is_admin())
  with check (public.manages_building(building_id) or public.is_admin());

create policy vevents_select on public.violation_events for select using (
  exists (select 1 from public.violations v where v.id = violation_id
          and (public.manages_building(v.building_id) or public.is_admin() or v.resident_id = auth.uid()))
);
create policy vevents_manager_write on public.violation_events for all using (
  exists (select 1 from public.violations v where v.id = violation_id
          and (public.manages_building(v.building_id) or public.is_admin()))
) with check (
  exists (select 1 from public.violations v where v.id = violation_id
          and (public.manages_building(v.building_id) or public.is_admin()))
);

create policy accom_select on public.accommodation_requests for select using (
  resident_id = auth.uid() or public.manages_building(building_id) or public.is_admin()
);
create policy accom_resident_insert on public.accommodation_requests for insert with check (resident_id = auth.uid());
create policy accom_manager_update on public.accommodation_requests for update
  using (public.manages_building(building_id) or public.is_admin())
  with check (public.manages_building(building_id) or public.is_admin());

create policy accomdoc_rw on public.accommodation_documents for all using (
  exists (select 1 from public.accommodation_requests r where r.id = request_id
          and (r.resident_id = auth.uid() or public.manages_building(r.building_id) or public.is_admin()))
) with check (
  exists (select 1 from public.accommodation_requests r where r.id = request_id
          and (r.resident_id = auth.uid() or public.is_admin()))
);

-- ===========================================================================
-- Policies — community
-- ===========================================================================
create policy posts_select on public.community_posts for select using (
  public.is_resident_of(building_id) or public.manages_building(building_id) or public.is_admin()
);
create policy posts_insert on public.community_posts for insert with check (
  author_id = auth.uid() and public.is_resident_of(building_id) and public.is_premium(auth.uid())
);
create policy posts_update_own on public.community_posts for update
  using (author_id = auth.uid() or public.manages_building(building_id) or public.is_admin())
  with check (author_id = auth.uid() or public.manages_building(building_id) or public.is_admin());

create policy reactions_select on public.post_reactions for select using (
  exists (select 1 from public.community_posts p where p.id = post_id
          and (public.is_resident_of(p.building_id) or public.manages_building(p.building_id) or public.is_admin()))
);
create policy reactions_self on public.post_reactions for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy comments_select on public.post_comments for select using (
  exists (select 1 from public.community_posts p where p.id = post_id
          and (public.is_resident_of(p.building_id) or public.manages_building(p.building_id) or public.is_admin()))
);
create policy comments_insert on public.post_comments for insert with check (author_id = auth.uid());

create policy lost_found_select on public.lost_found for select using (
  building_id is null or public.is_resident_of(building_id) or public.manages_building(building_id) or public.is_admin()
);
create policy lost_found_insert on public.lost_found for insert with check (reporter_id = auth.uid());

create policy events_select on public.events for select using (
  building_id is null or public.is_resident_of(building_id) or public.manages_building(building_id) or public.is_admin()
);
create policy events_write on public.events for all
  using (created_by = auth.uid() or public.manages_building(building_id) or public.is_admin())
  with check (created_by = auth.uid() or public.manages_building(building_id) or public.is_admin());

create policy rsvps_self on public.event_rsvps for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ===========================================================================
-- Policies — businesses / billing / money (writes are service-role only)
-- ===========================================================================
create policy businesses_select on public.businesses for select using (true);
create policy businesses_owner_write on public.businesses for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy businesses_admin_all on public.businesses for all using (public.is_admin()) with check (public.is_admin());

create policy listings_select on public.business_listings for select using (true);
create policy listings_owner_write on public.business_listings for all using (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
) with check (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
);

create policy plans_select on public.billing_plans for select using (true);
create policy plans_admin_all on public.billing_plans for all using (public.is_admin()) with check (public.is_admin());

create policy subs_select  on public.subscriptions for select using (profile_id = auth.uid() or public.is_admin());
create policy bsubs_select on public.building_subscriptions for select using (public.manages_building(building_id) or public.is_admin());
create policy seats_select on public.sponsored_seats for select using (profile_id = auth.uid() or public.is_admin());

create policy fines_select on public.fines for select using (
  public.manages_building(building_id) or public.is_admin() or resident_id = auth.uid()
);
create policy fines_manager_write on public.fines for all
  using (public.manages_building(building_id) or public.is_admin())
  with check (public.manages_building(building_id) or public.is_admin());

create policy payments_select on public.payments for select using (profile_id = auth.uid() or public.is_admin());
create policy payouts_select  on public.payouts for select using (public.manages_building(building_id) or public.is_admin());

create policy bookings_select on public.service_bookings for select using (
  customer_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
);
create policy bookings_insert on public.service_bookings for insert with check (customer_id = auth.uid());

-- ===========================================================================
-- Policies — infra
-- ===========================================================================
create policy notifs_select on public.notifications for select using (profile_id = auth.uid() or public.is_admin());
create policy notifs_update on public.notifications for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy push_self on public.push_tokens for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy emtokens_select on public.emergency_access_tokens for select using (public.manages_building(building_id) or public.is_admin());
create policy emtokens_manager_write on public.emergency_access_tokens for all
  using (public.manages_building(building_id) or public.is_admin())
  with check (public.manages_building(building_id) or public.is_admin());

create policy audit_select on public.audit_log for select using (
  public.is_admin() or (building_id is not null and public.manages_building(building_id))
);
-- audit_log / payments / payouts / subscriptions / sponsored_seats have no
-- insert/update policies → only the service role (webhooks, Edge Functions) writes them.

-- ===========================================================================
-- Storage buckets + baseline policies
-- ===========================================================================
insert into storage.buckets (id, name, public) values
  ('avatars','avatars', true),
  ('pet-media','pet-media', false),
  ('community-media','community-media', false),
  ('business-media','business-media', true),
  ('guest-evidence','guest-evidence', false),
  ('accommodation-docs','accommodation-docs', false)
on conflict (id) do nothing;

-- Avatars: public read, owner-folder write (path = avatars/<uid>/...).
create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars owner write" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars owner update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
-- pet-media / community-media / business-media / guest-evidence / accommodation-docs
-- get feature-specific policies when their upload flows land; until then only the
-- service role can read/write them (default-deny).
