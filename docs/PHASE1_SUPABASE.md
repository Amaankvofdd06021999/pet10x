# Phase 1 — Supabase backend

This phase adds the real backend: Postgres schema, Row-Level Security, the
entitlements model, and the Supabase client. The app keeps running on mock data
until you set the env vars below — then we swap the data hooks over (next step).

## What's here

```
supabase/
  config.toml                     local CLI config
  migrations/
    20260601000000_init_schema.sql    extensions, enums, ~40 tables, indexes, triggers
    20260601000001_functions_rls.sql  entitlements, role helpers, auth→profile trigger,
                                       RLS on every table, storage buckets
  seed.sql                        billing plans + the demo building & units
lib/supabase/
  client.ts                       browser client + isSupabaseConfigured()
  server.ts                       server client (cookies/session)
.env.example                      env template
```

**Roles:** `pet_owner`, `building_manager`, `super_admin`, `business`. Guests are
unauthenticated (no profile) — incident reports come in via a service-role Edge
Function later.

**Entitlements (single source of truth):** `is_premium(user)` = an active
individual subscription **OR** an approved building link to a building with an
active seat-based subscription. Computed by `public.resolve_entitlement()` /
`public.is_premium()` and exposed via the `user_entitlements` view. RLS enforces
it server-side (e.g. posting to the community requires `is_premium`).

## Setup

### Option A — Cloud (recommended for a real launch)
1. Create a project at [supabase.com](https://supabase.com). **Region: `Canada (Central)`** (PIPEDA / data residency).
2. Install the CLI: `brew install supabase/tap/supabase` (or `npx supabase`).
3. From the repo: `supabase link --project-ref <your-ref>`
4. Push the schema + seed:
   ```bash
   supabase db push          # applies migrations
   psql "$DATABASE_URL" -f supabase/seed.sql   # or run seed.sql in the SQL editor
   ```
5. Copy `.env.example` → `.env.local` and fill from **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### Option B — Local (needs Docker)
```bash
supabase start           # boots Postgres + Auth + Storage in Docker
supabase db reset        # applies migrations + seed.sql
supabase status          # prints your local URL + anon/service keys → .env.local
```

### Generate typed client (after migrations are applied)
```bash
supabase gen types typescript --linked > lib/supabase/database.types.ts   # cloud
# or: supabase gen types typescript --local > lib/supabase/database.types.ts
```
Then type the clients with `createBrowserClient<Database>(...)`.

## Create demo data (after you sign up real accounts)

The seed deliberately does **not** create auth users (that's fragile to script).
Sign up two accounts in the app, then run this in the SQL editor — replacing the
emails — to wire a manager, an approved resident, building-sponsored premium, and
a demo pet:

```sql
-- Manager of Harbour View Tower
update public.profiles set role='building_manager' where email='manager@example.com';
insert into public.building_managers (building_id, profile_id)
select '00000000-0000-0000-0000-0000000b1d61', id from public.profiles where email='manager@example.com'
on conflict do nothing;

-- Approved resident in unit 2104
insert into public.resident_links (profile_id, building_id, unit_id, status, decided_at)
select p.id, '00000000-0000-0000-0000-0000000b1d61', u.id, 'approved', now()
from public.profiles p, public.units u
where p.email='resident@example.com'
  and u.building_id='00000000-0000-0000-0000-0000000b1d61' and u.unit_number='2104';

-- Building-sponsored premium for that resident
insert into public.building_subscriptions (id, building_id, plan_id, status, seat_unit_amount_cents)
values ('00000000-0000-0000-0000-00000005ea70','00000000-0000-0000-0000-0000000b1d61','building_seat_monthly','active',299)
on conflict do nothing;
insert into public.sponsored_seats (building_subscription_id, profile_id, resident_link_id)
select '00000000-0000-0000-0000-00000005ea70', rl.profile_id, rl.id
from public.resident_links rl join public.profiles p on p.id=rl.profile_id
where p.email='resident@example.com' and rl.building_id='00000000-0000-0000-0000-0000000b1d61'
on conflict do nothing;

-- A demo pet
insert into public.pets (owner_id, building_id, unit_id, name, species, breed, status, compliance_pct, neutered)
select p.id, '00000000-0000-0000-0000-0000000b1d61', u.id, 'Max', 'dog', 'Golden Retriever', 'home', 92, true
from public.profiles p, public.units u
where p.email='resident@example.com'
  and u.building_id='00000000-0000-0000-0000-0000000b1d61' and u.unit_number='2104';

-- Verify the entitlement resolved to building-sponsored:
select * from public.user_entitlements
where profile_id = (select id from public.profiles where email='resident@example.com');
```

## Next steps (in progress)
1. **Auth** — replace the mock sign-in with Supabase Auth (email/OTP + Apple/Google), add `middleware.ts` for session refresh, and a real `AuthProvider`.
2. **Swap the data hooks** in `lib/data/hooks.ts` from mock → Supabase queries (React Query), keeping the same `{ data, isLoading, error }` shape so screens don't change.
3. **Generate `database.types.ts`** and type the clients.
