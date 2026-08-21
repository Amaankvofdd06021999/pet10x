# Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the database's real state under version control, fix a live defect that files violations against the person who reported them, close four storage buckets that have no policies, and stand up the test harness the next nine phases depend on.

**Architecture:** Four independent tasks. Task 1 adds Vitest and covers `lib/rbac.ts`, the security-relevant pure logic that currently has no tests. Task 2 captures four RPCs that exist only in the remote database into a migration, and fixes `escalate_incident_to_violation` plus the rows it has already corrupted. Task 3 adds the missing `storage.objects` policies. Task 4 writes the capability matrix the later phases verify against.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Supabase (Postgres 17), Vitest 3, `pnpm` via corepack.

**Spec:** [`docs/superpowers/specs/2026-08-21-completing-manager-resident-flows-design.md`](../specs/2026-08-21-completing-manager-resident-flows-design.md)

**Roadmap:** [`docs/superpowers/plans/2026-08-21-pet10x-completion-roadmap.md`](./2026-08-21-pet10x-completion-roadmap.md)

## Global Constraints

- **RLS is the floor, the query is the filter.** Every new read names its scope explicitly.
- **A control that cannot act must not exist.** No `toast()` standing in for a mutation.
- **Cross-user writes go through `SECURITY DEFINER`.** The `notifications` insert policy admits only `kind = 'assistant'` for self.
- **Migrations are the source of truth.** Nothing lands in the remote database that is not in `supabase/migrations/`.
- **Supabase project:** `Pet10x`, ref `ekgejmxgnlmdomkpblki`, region `ca-central-1`.
- **Package manager is pnpm**, driven through corepack — the CLI is not installed globally on this machine. Neither is the Supabase CLI or Docker, so migrations are applied with the Supabase MCP `apply_migration` tool and verified with `execute_sql`.
- **Migration filenames** follow the existing convention `YYYYMMDDHHMMSS_snake_case.sql` in `supabase/migrations/`.

---

## Task 1: Test harness

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/rbac.test.ts`
- Modify: `package.json` (add `test` and `test:watch` scripts, add `vitest` devDependency)

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm test` runs the suite. Later phases add `*.test.ts` files next to the code they cover and are picked up by the `include` glob `{lib,app,components}/**/*.test.{ts,tsx}`.

- [ ] **Step 1: Enable pnpm**

Node 24 ships corepack but pnpm is not activated on this machine.

```bash
corepack enable pnpm
pnpm --version
```

Expected: a version number prints. If corepack refuses, run `corepack prepare pnpm@latest --activate` first.

- [ ] **Step 2: Write the failing test**

Create `lib/rbac.test.ts`. These cover the two functions that decide what every account may reach, and the two regressions already documented in `docs/RBAC_PERSONAS.md`.

```ts
import { describe, expect, it } from "vitest"
import { canAccessRoute, defaultPersona, findRouteRule, personasFor, type PersonaGrants } from "./rbac"

describe("canAccessRoute", () => {
  it("lets a pet owner into /app", () => {
    expect(canAccessRoute("/app", { role: "pet-owner", isSuperAdmin: false })).toBe(true)
  })

  it("keeps a pet owner out of the strata portal", () => {
    expect(canAccessRoute("/strata-portal", { role: "pet-owner", isSuperAdmin: false })).toBe(false)
  })

  it("requires the admin flag for /admin, not merely the role", () => {
    expect(canAccessRoute("/admin", { role: "super-admin", isSuperAdmin: false })).toBe(false)
    expect(canAccessRoute("/admin", { role: "pet-owner", isSuperAdmin: true })).toBe(true)
  })

  it("lets the admin flag transcend every scope", () => {
    expect(canAccessRoute("/strata-portal", { role: "pet-owner", isSuperAdmin: true })).toBe(true)
  })

  it("denies a suspended account every route, admin flag included", () => {
    expect(canAccessRoute("/app", { role: "pet-owner", isSuperAdmin: true, isSuspended: true })).toBe(false)
  })

  it("treats an unmatched path as public", () => {
    expect(canAccessRoute("/login", { role: null, isSuperAdmin: false })).toBe(true)
  })

  it("matches on the longest prefix", () => {
    expect(findRouteRule("/app/anything")?.prefix).toBe("/app")
    expect(findRouteRule("/nowhere")).toBeNull()
  })
})

describe("personasFor", () => {
  const base: PersonaGrants = {
    profileId: "p1",
    defaultRole: "pet_owner",
    isSuspended: false,
    isSuperAdmin: false,
    ownsPets: true,
    managedBuildings: [],
  }

  it("gives a plain signup exactly one persona, so no switcher appears", () => {
    expect(personasFor(base)).toEqual(["pet-owner"])
  })

  it("adds building-manager from one managed building", () => {
    const grants = { ...base, managedBuildings: [{ id: "b1", name: "A", isPrimary: true }] }
    expect(personasFor(grants)).toEqual(["pet-owner", "building-manager"])
  })

  it("adds strata only from two buildings up", () => {
    const grants = {
      ...base,
      managedBuildings: [
        { id: "b1", name: "A", isPrimary: true },
        { id: "b2", name: "B", isPrimary: false },
      ],
    }
    expect(personasFor(grants)).toEqual(["pet-owner", "building-manager", "strata-manager"])
  })

  it("gives a suspended account none", () => {
    expect(personasFor({ ...base, isSuspended: true })).toEqual([])
  })

  it("treats business as its own surface, not a persona held alongside residency", () => {
    expect(personasFor({ ...base, defaultRole: "business" })).toEqual(["business"])
  })
})

describe("defaultPersona", () => {
  it("prefers a granted building over a stale role column", () => {
    // The documented regression: a granted manager whose profiles.role still
    // read pet_owner was dropped into resident onboarding, with their own
    // building nowhere in sight.
    expect(defaultPersona(["pet-owner", "building-manager"], "pet_owner")).toBe("building-manager")
  })

  it("does not send an admin who manages a building into the console every morning", () => {
    expect(defaultPersona(["pet-owner", "building-manager", "super-admin"], "super_admin")).toBe(
      "building-manager",
    )
  })

  it("returns null when nothing was granted", () => {
    expect(defaultPersona([], "pet_owner")).toBeNull()
  })
})
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
pnpm test
```

Expected: FAIL — `Unknown command: "test"` (the script does not exist yet), or once added, `Cannot find package 'vitest'`.

- [ ] **Step 4: Install Vitest and configure it**

```bash
pnpm add -D vitest@^3
```

Create `vitest.config.ts`. The alias mirrors the `@/*` path in `tsconfig.json`, which `lib/rbac.ts` uses to reach `@/lib/data/types`.

```ts
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["{lib,app,components}/**/*.test.{ts,tsx}"],
  },
})
```

Add the scripts to `package.json`, alongside the existing `dev` / `build` / `start` / `lint`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
pnpm test
```

Expected: PASS — 15 tests across 3 suites.

If `canAccessRoute("/admin", { role: "super-admin", isSuperAdmin: false })` returns `true`, stop: that is a real access-control defect, not a bad test. Report it rather than changing the assertion.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts lib/rbac.test.ts package.json pnpm-lock.yaml
git commit -m "Give the access rules something that checks them

lib/rbac.ts decides what every account may reach and had no tests. These
cover both regressions the RBAC notes describe: an admin flag transcending
scope, and a granted manager whose role column still says pet_owner."
```

---

## Task 2: Capture the drifted RPCs and fix escalation

**Files:**
- Create: `supabase/migrations/20260821000000_capture_incident_rpcs_and_fix_escalation.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `escalate_incident_to_violation(p_incident uuid, p_type text default null) returns jsonb` — unchanged signature, corrected body. Phase 4 replaces its `'investigation'` literal with `'open'`.

**Background.** `submit_incident_report`, `escalate_incident_to_violation`, `incident_status_by_reference` and `resolve_building_code` exist in the remote database and in no migration. Separately, `escalate_incident_to_violation` opens each violation with `resident_id = v_inc.reporter_id` — the person who *filed* the report — and never carries `pet_id` across. Both are fixed here. See AD-11.

- [ ] **Step 1: Write the failing assertion**

Run this with the Supabase MCP `execute_sql` tool against project `ekgejmxgnlmdomkpblki`:

```sql
select
  (select count(*) from public.violations v
     join public.incident_reports i on i.id = v.origin_incident_id
    where v.resident_id is not distinct from i.reporter_id
      and i.reporter_id is not null)                     as reporter_is_subject,
  (select count(*) from public.violations v
     join public.incident_reports i on i.id = v.origin_incident_id
    where v.pet_id is null and i.pet_id is not null)     as pet_dropped,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_incident_report') as submit_overloads;
```

Expected (the failure): `reporter_is_subject = 1`, `pet_dropped = 1`, `submit_overloads = 2`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260821000000_capture_incident_rpcs_and_fix_escalation.sql`:

```sql
-- Four functions the app calls every day existed only in the remote database.
-- A fresh `supabase db reset` produced a schema the app could not run against.
-- They are captured here verbatim, except escalate_incident_to_violation,
-- which is also fixed: see the note above it.

-- One of two overloads. The 6-arg version predates pet identification and is
-- unreachable from the client, but an ambiguous call would still resolve to it.
drop function if exists public.submit_incident_report(text, text, text, text, text, boolean);

create or replace function public.resolve_building_code(p_code text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select case
    when b.id is null then jsonb_build_object('valid', false)
    else jsonb_build_object('valid', true, 'building_id', b.id, 'name', b.name)
  end
  from (select 1) dummy
  left join public.buildings b
    on upper(b.building_code) = upper(trim(p_code));
$function$;

create or replace function public.incident_status_by_reference(p_ref text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  -- Deliberately narrow: status and timestamps only. No reporter identity, no
  -- manager notes, nothing about the accused resident or their pet.
  select case
    when i.id is null then jsonb_build_object('found', false)
    else jsonb_build_object(
      'found', true,
      'reference', i.reference_code,
      'status', i.status,
      'type', i.type,
      'building', b.name,
      'filed_at', i.created_at,
      'escalated', i.status = 'linked_to_violation'
    )
  end
  from (select 1) dummy
  left join public.incident_reports i on upper(i.reference_code) = upper(trim(p_ref))
  left join public.buildings b on b.id = i.building_id;
$function$;

create or replace function public.submit_incident_report(
  p_building_code text,
  p_type          text,
  p_description   text,
  p_location      text default null,
  p_unit          text default null,
  p_anonymous     boolean default true,
  p_pet_id        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_building uuid;
  v_ref      text;
  v_id       uuid;
  v_pet      uuid;
begin
  select id into v_building
  from public.buildings
  where upper(building_code) = upper(trim(p_building_code));

  if v_building is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if coalesce(trim(p_description), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'description_required');
  end if;

  -- Only a pet that actually lives in this building. Silently dropped rather
  -- than rejected: a stale id should not lose someone's written report.
  if p_pet_id is not null then
    select p.id into v_pet
    from public.pets p
    where p.id = p_pet_id and p.building_id = v_building and p.deleted_at is null;
  end if;

  v_ref := 'IR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.incident_reports (
    building_id, reporter_id, is_anonymous, type, description,
    location_text, unit_involved, pet_id, status, reference_code
  )
  values (
    v_building,
    case when p_anonymous then null else auth.uid() end,
    p_anonymous,
    p_type::incident_type,
    trim(p_description),
    nullif(trim(coalesce(p_location, '')), ''),
    nullif(trim(coalesce(p_unit, '')), ''),
    v_pet,
    'submitted',
    v_ref
  )
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'incident.submitted', 'incident_report', v_id, v_building,
          jsonb_build_object('anonymous', p_anonymous, 'reference', v_ref,
                             'pet_identified', v_pet is not null));

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$function$;

-- FIXED (AD-11). This function used to open the violation with
--   resident_id = v_inc.reporter_id
-- which is the person who FILED the report. Reporting a neighbour's dog
-- non-anonymously therefore opened a case against yourself, and it did:
-- incident IR-454B06 identified the pet Simba, and produced a violation
-- naming the reporter with pet_id null.
--
-- The subject of a violation is the owner of the identified pet. Where no pet
-- was identified there is no subject yet, so resident_id stays null and the
-- manager assigns it — which is what the investigation stage is for.
create or replace function public.escalate_incident_to_violation(
  p_incident uuid,
  p_type     text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inc   record;
  v_vio   uuid;
  v_owner uuid;
  v_unit  uuid;
begin
  select * into v_inc from public.incident_reports where id = p_incident;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so re-check the caller's scope by hand.
  if not (public.manages_building(v_inc.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select p.owner_id, p.unit_id into v_owner, v_unit
  from public.pets p
  where p.id = v_inc.pet_id and p.deleted_at is null;

  insert into public.violations (
    building_id, unit_id, resident_id, pet_id, origin_incident_id,
    type, stage, opened_by
  )
  values (
    v_inc.building_id,
    coalesce(v_unit, v_inc.unit_id),
    v_owner,
    v_inc.pet_id,
    v_inc.id,
    coalesce(p_type, v_inc.type::text),
    'investigation',
    auth.uid()
  )
  returning id into v_vio;

  update public.incident_reports
     set status = 'linked_to_violation', triaged_by = auth.uid()
   where id = p_incident;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'incident.escalated', 'incident_report', p_incident, v_inc.building_id,
          jsonb_build_object('violation_id', v_vio, 'resident_id', v_owner));

  return jsonb_build_object('ok', true, 'violation_id', v_vio);
end;
$function$;

-- Repair what the old body wrote. Any violation whose subject is its own
-- reporter is recomputed from the pet the report identified.
with corrected as (
  select v.id,
         pt.owner_id as correct_resident,
         pt.unit_id  as correct_unit
  from public.violations v
  join public.incident_reports i on i.id = v.origin_incident_id
  left join public.pets pt on pt.id = i.pet_id and pt.deleted_at is null
  where v.resident_id is not distinct from i.reporter_id
    and i.reporter_id is not null
)
update public.violations v
   set resident_id = c.correct_resident,
       unit_id     = coalesce(c.correct_unit, v.unit_id)
  from corrected c
 where v.id = c.id;

-- And carry across the pet the old body dropped.
update public.violations v
   set pet_id = i.pet_id
  from public.incident_reports i
 where i.id = v.origin_incident_id
   and v.pet_id is null
   and i.pet_id is not null;
```

- [ ] **Step 3: Apply the migration**

Use the Supabase MCP `apply_migration` tool against project `ekgejmxgnlmdomkpblki`, with name `capture_incident_rpcs_and_fix_escalation` and the file's contents as the query.

- [ ] **Step 4: Re-run the assertion to confirm it passes**

Run the Step 1 query again.

Expected: `reporter_is_subject = 0`, `pet_dropped = 0`, `submit_overloads = 1`.

Then confirm the specific row was repaired to the right person:

```sql
select v.id, v.resident_id, v.pet_id, p.full_name
from public.violations v
left join public.profiles p on p.id = v.resident_id
where v.id = '5570be70-8a79-48f9-80bc-dd09d3a82e56';
```

Expected: `resident_id = de3df834-fcc7-44a7-8b0f-eeab04e7d2d0` (Simba's owner, "Amaan"), `pet_id = 45c8ab58-57c4-4dd8-bab5-7e33b2249a09`. It must **not** be `830b348a-a339-422b-a18b-ccb31281a184`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821000000_capture_incident_rpcs_and_fix_escalation.sql
git commit -m "Stop filing the violation against the person who reported it

escalate_incident_to_violation set the new violation's resident_id from
the incident's reporter_id. Report a neighbour's dog under your own name
and the case opened against you — which is what happened to IR-454B06,
where the reporter identified Simba and the violation named the reporter
with no pet attached.

The subject is the owner of the identified pet. With no pet identified
there is no subject yet, so it stays null and the manager assigns one.

Also captures four RPCs that lived only in the remote database, so a
fresh db reset stops producing a schema the app cannot run against."
```

---

## Task 3: Storage policies for the four bare buckets

**Files:**
- Create: `supabase/migrations/20260821000001_storage_policies.sql`
- Create: `supabase/migrations/20260821000002_fix_pet_media_manager_read.sql` (Step 5a)
- Create: `supabase/migrations/20260821000003_storage_policy_reconciliation.sql` (Step 5b)

**Interfaces:**
- Consumes: `public.manages_building(uuid)` and `public.is_admin()`, both already defined.
- Produces: the `guest-evidence` read policy that Phase 1's manager display depends on, and the `pet-media` manager read that Phase 2 uses for incident thumbnails.

**Background.** `storage.objects` carries six policies (`avatars` 2, `pet-media` 4). `guest-evidence`, `accommodation-docs` and `community-media` have none, so no role can read or write them. `pet-media` is readable only by the owning uid, which is why the pet picker in both report flows renders no photos.

**Correction, found during execution.** The `pet-media manager read` policy below is written with an unqualified `name` inside `exists (select 1 from public.pets p …)`. Postgres binds that to `pets.name`, not the object path, so the policy can never match a row. It must be written `storage.foldername(storage.objects.name)` — the code block in Step 2 now shows the corrected form. The other six are unaffected: `guest-evidence` and `community-media` have no subquery, and `accommodation_requests` has no `name` column to collide. Because `20260821000001` had already been applied remotely when this was found, the fix landed as **Step 5a**, a separate migration, rather than an edit.

**Second correction, found during review.** Two further problems, closed together in **Step 5b**:

1. *The `::uuid` casts raise instead of denying.* `manages_building(((storage.foldername(name))[1])::uuid)` throws `22P02` on a non-UUID segment rather than evaluating false. `community-media uploader write` constrains only segment 2, so any authenticated user could upload one object under a non-UUID first segment and thereby break **every** read of that bucket, for every reader including admins. An availability failure, not a leak — and inert only while the bucket is empty.
2. *`storage.objects` policy state is not reproducible from migrations.* `avatars public read` is declared in `20260601000001_functions_rls.sql:400` but does not exist live, and the four live `pet-media owner {read,insert,update,delete}` policies appear in no migration at all. A fresh `db reset` produces 10 policies rather than 13, and **pet photo read and upload for owners silently vanishes** — the same drift class this phase exists to close, with a wider blast radius than the four RPCs.

- [ ] **Step 1: Write the failing assertion**

```sql
select b.id as bucket,
       count(p.polname) filter (
         where pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid)
               like '%' || b.id || '%'
       ) as policies
from storage.buckets b
left join pg_policy p on p.polrelid = 'storage.objects'::regclass
group by b.id order by b.id;
```

Expected (the failure): `accommodation-docs = 0`, `community-media = 0`, `guest-evidence = 0`. `avatars` and `pet-media` are non-zero.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260821000001_storage_policies.sql`:

```sql
-- Three buckets existed with no policies at all, so no role could read or
-- write them. A fourth, pet-media, was readable only by the uid that uploaded
-- — which is why the pet picker shown to a reporter renders no photos.

-- guest-evidence: SELECT only, and only for managers of the building the path
-- names. There is deliberately NO client INSERT policy: uploads happen through
-- a signed upload URL minted server-side (Phase 1, AD-1), because a guest
-- reporter has no session and auth.uid() is null for them.
-- Path convention: {buildingId}/{draftId}/{n}.{ext}
create policy "guest-evidence manager read"
  on storage.objects for select
  using (
    bucket_id = 'guest-evidence'
    and (
      public.manages_building(((storage.foldername(name))[1])::uuid)
      or public.is_admin()
    )
  );

-- accommodation-docs: the resident who owns the request, and managers of its
-- building. Path convention: {buildingId}/{requestId}/{filename}
create policy "accommodation-docs read"
  on storage.objects for select
  using (
    bucket_id = 'accommodation-docs'
    and exists (
      select 1 from public.accommodation_requests r
      where r.id::text = (storage.foldername(name))[2]
        and (r.resident_id = auth.uid()
             or public.manages_building(r.building_id)
             or public.is_admin())
    )
  );

create policy "accommodation-docs resident write"
  on storage.objects for insert
  with check (
    bucket_id = 'accommodation-docs'
    and exists (
      select 1 from public.accommodation_requests r
      where r.id::text = (storage.foldername(name))[2]
        and r.resident_id = auth.uid()
    )
  );

-- community-media: residents and managers of the building read; the uploader
-- writes into their own folder.
-- Path convention: {buildingId}/{uploaderUid}/{filename}
create policy "community-media building read"
  on storage.objects for select
  using (
    bucket_id = 'community-media'
    and (
      public.is_resident_of(((storage.foldername(name))[1])::uuid)
      or public.manages_building(((storage.foldername(name))[1])::uuid)
      or public.is_admin()
    )
  );

create policy "community-media uploader write"
  on storage.objects for insert
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

create policy "community-media uploader delete"
  on storage.objects for delete
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

-- pet-media: a manager of the building a pet lives in may read that pet's
-- files. The existing owner policies are untouched; this only widens SELECT.
-- Path convention is {ownerUid}/{petId}/..., so segment 2 is the pet.
-- NOTE: `storage.objects.name` MUST be qualified here. An unqualified `name`
-- inside the exists() binds to `pets.name` and the policy can never match.
create policy "pet-media manager read"
  on storage.objects for select
  using (
    bucket_id = 'pet-media'
    and exists (
      select 1 from public.pets p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and (public.manages_building(p.building_id) or public.is_admin())
    )
  );
```

- [ ] **Step 3: Apply the migration**

Use `apply_migration` against `ekgejmxgnlmdomkpblki` with name `storage_policies`.

- [ ] **Step 4: Verify the policies exist and are correctly scoped**

```sql
select polname, polcmd
from pg_policy where polrelid = 'storage.objects'::regclass
order by polname;
```

Expected: 13 rows — the 6 that existed plus the 7 added here.

Then prove `guest-evidence` denies a non-manager. Substitute a profile id that manages no building:

```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"830b348a-a339-422b-a18b-ccb31281a184","role":"authenticated"}';
select public.manages_building('00000000-0000-0000-0000-000000000000'::uuid) as should_be_false;
rollback;
```

Expected: `should_be_false = f`. A `t` here means the policy would admit the wrong reader — stop and report.

- [ ] **Step 5a: Correct the `pet-media` binding (new migration, never an edit)**

`20260821000001` has already been applied remotely, so the fix is a new file, `supabase/migrations/20260821000002_fix_pet_media_manager_read.sql`: `drop policy if exists "pet-media manager read" on storage.objects;` then recreate it identically but with `storage.foldername(storage.objects.name)`. Carry a comment saying why the qualification is load-bearing, including the `accommodation-docs` contrast, so nobody simplifies it back.

Verify with three actors, not one: a manager of the pet's building must go from 0 to 2 visible objects; the owning uid must still see 2; and **a manager of a different building must still see 0**. Pick that last actor carefully — it must not be a super-admin, or `is_admin()` makes the control meaningless.

- [ ] **Step 5b: Make the policy set fail closed and reproduce from migrations**

`supabase/migrations/20260821000003_storage_policy_reconciliation.sql`:

1. Recreate `guest-evidence manager read` and `community-media building read` so a malformed path segment evaluates **false** instead of raising `22P02` — guard the cast with a UUID shape test before casting.
2. Tighten `community-media uploader write` so segment 1 must be a building the uploader is a resident or manager of, closing the vector that lets a bad path land in the first place.
3. Capture the four out-of-band `pet-media owner {read,insert,update,delete}` policies so a reset reproduces them. Match the live definitions exactly — `pg_get_expr` on `pg_policy` is the source.
4. `drop policy if exists "avatars public read"` — it is declared in `20260601000001_functions_rls.sql:400` but absent live, and `avatars.public = true` makes a SELECT policy redundant anyway. Dropping it in the new migration makes a fresh reset converge on the live state instead of diverging from it.

Verify: total policies still 13, a non-UUID segment returns false rather than erroring, and the four owner policies' expressions match what they were before.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821000001_storage_policies.sql
git commit -m "Give four buckets the policies they never had

guest-evidence, accommodation-docs and community-media carried no
policies at all, so no role could read or write them. pet-media allowed
reads only from the uid that uploaded, which is why the pet picker a
reporter is shown renders no photos.

guest-evidence gets SELECT and nothing else: uploads arrive through a
signed URL minted server-side, because a guest has no session to scope
an insert policy against."
```

---

## Task 4: The capability matrix

**Files:**
- Create: `docs/RBAC_CAPABILITIES.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the document every later phase verifies its rows against, per the roadmap's definition of done.

- [ ] **Step 1: Write the document**

Create `docs/RBAC_CAPABILITIES.md`:

````markdown
# Who may do what

Companion to `RBAC_PERSONAS.md`, which explains *why* the model is grant-derived.
This is the flat answer to *what is allowed*, and the recipe for checking it.

A persona is a view, never a permission. Every row below is enforced in the
database — by an RLS policy, or by a `SECURITY DEFINER` function that
re-checks scope by hand because it bypasses RLS.

"anon (code only)" is a guest holding a building code and no session at all.
`signInGuest` sets client state; it creates no auth user. Possession of a code
authorises intake and nothing else — it never grants a read of stored data.

| Capability | anon (code only) | resident | manager of building | super-admin | Enforced by |
| --- | --- | --- | --- | --- | --- |
| File an incident | ✅ | ✅ | ✅ | ✅ | `submit_incident_report` |
| Upload evidence | ✅ | ✅ | ✅ | ✅ | signed upload URL, server-minted |
| Read evidence | ❌ | ❌ | ✅ own buildings | ✅ | `guest-evidence manager read` |
| Look up a report by reference | ✅ | ✅ | ✅ | ✅ | `incident_status_by_reference` |
| Triage an incident | ❌ | ❌ | ✅ | ✅ | `incidents_manager_update` |
| Escalate to a violation | ❌ | ❌ | ✅ | ✅ | `escalate_incident_to_violation` |
| Advance a violation degree | ❌ | ❌ | ✅ | ✅ | `manager_advance_violation` *(Phase 4)* |
| Read own violations and fines | ❌ | ✅ own | ✅ building | ✅ | `violations_select`, `fines_select` |
| Dispute a violation | ❌ | ✅ own | ❌ | ✅ | `dispute_violation` *(Phase 5)* |
| Decide a dispute | ❌ | ❌ | ✅ | ✅ | `manager_resolve_dispute` *(Phase 5)* |
| Request an accommodation | ❌ | ✅ | ✅ | ✅ | `accom_resident_insert` |
| Decide an accommodation | ❌ | ❌ | ✅ | ✅ | `accom_manager_update` |
| Set the fine schedule | ❌ | ❌ | ✅ | ✅ | `buildings` update policy *(Phase 4)* |
| Write or publish a building rule | ❌ | ❌ | ✅ | ✅ | `publish_building_rule` *(Phase 6)* |
| Read a building rule | ❌ | ✅ published, own building | ✅ all, own buildings | ✅ | `building_rules` select *(Phase 6)* |
| Post, RSVP, report lost & found | ❌ | ✅ | ✅ | ✅ | community RLS |
| Read another resident's pet photo | ❌ | ❌ | ✅ own buildings | ✅ | `pet-media manager read` |

Rows marked *(Phase N)* are specified but not yet built. The phase that builds
one removes its marker and adds its verification.

## Two rules that keep this true

**RLS is the floor, the query is the filter.** A policy guarantees a query
cannot get *more* than it should. It does not narrow an unfiltered read. Every
read names its scope explicitly — reading with no `WHERE` and trusting the
policy is correct for unprivileged accounts and silently wrong for every
privileged one, which is the case least likely to be tested. See the measured
example in `RBAC_PERSONAS.md`.

**A `SECURITY DEFINER` function bypasses RLS, so it re-checks scope by hand.**
Every one of them opens with `manages_building(...) or is_admin()`, or the
equivalent ownership test, and returns a structured error rather than raising.

## How to verify a row

Impersonate the actor in SQL and assert both directions — that the allowed case
returns rows and the denied case returns none. Never assert only the happy path.

```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"<profile-uuid>","role":"authenticated"}';

select count(*) from public.violations;   -- expect: only their own / their buildings

rollback;
```

For a guest, use `set local role anon` and set no claims at all.

Run the denied case against a real id from a *different* building, not a
made-up uuid — a policy that fails open on a nonexistent row still fails open.
````

- [ ] **Step 2: Verify one row end to end**

Prove the matrix is describing reality rather than intent. Pick the "Read own violations" row and run both directions with `execute_sql`:

```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"de3df834-fcc7-44a7-8b0f-eeab04e7d2d0","role":"authenticated"}';
select count(*) as visible_to_this_resident from public.violations;
rollback;
```

Expected: a small number — the violations where they are the resident, or a building they manage. Compare against the unrestricted total:

```sql
select count(*) as total from public.violations;
```

Expected: `total = 13`, and `visible_to_this_resident` strictly less. If they are equal, the policy is not narrowing and that is a finding — report it rather than adjusting the document.

- [ ] **Step 3: Commit**

```bash
git add docs/RBAC_CAPABILITIES.md
git commit -m "Write down who may do what, and how to check it

RBAC_PERSONAS explains why the model is grant-derived. This is the flat
answer, one row per capability, naming the policy or function that
enforces each — plus the impersonation recipe, so a later phase can
prove its rows rather than assert them."
```

---

## Task 5: Capture the remaining drifted migrations

**Added during execution.** Task 2 captured four RPCs and Task 3 captured the storage policies, but review then showed the drift is phase-wide: the remote project has **61 applied migrations against 43 local files**, and **17 applied migrations have no local file at all** after Tasks 2 and 3. Among them are `my_app_user_rpc`, `guest_incident_intake`, `emergency_directory_rpc`, `care_tracking`, `harden_security` and `phaseB_onboarding_building_link`.

This task exists because Phase 0's headline claim — *migrations are the source of truth* — is false without it. A fresh `db reset` today still produces a database with no `my_app_user()`, no guest incident intake, and no emergency directory.

It is tractable because it is a **dump, not a reconstruction**: the exact SQL that ran is stored in `supabase_migrations.schema_migrations.statements`.

**Files:**
- Create: one `supabase/migrations/<version>_<name>.sql` per uncaptured remote migration (17 files)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new at runtime. This task must change **zero** database behaviour — it only writes down what already ran.

- [ ] **Step 1: Establish the gap**

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

Compare against `ls supabase/migrations/*.sql`. Note that local filenames and remote versions do not correspond — match on the **name** portion, not the timestamp. Record the list of remote-only names. Expect 17 after excluding `submit_incident_with_pet` and `pet_media_storage_policies`, which Tasks 2 and 3 already superseded.

`pet_attributes` appears local-only; it is the same migration as remote `pet_attributes_size_restraint_diet` under a different name, not a missing apply. Leave it alone.

- [ ] **Step 2: Dump each one verbatim**

For each remote-only migration:

```sql
select statements from supabase_migrations.schema_migrations where name = '<name>';
```

`statements` is a text array of the individual statements as executed. Write each migration to `supabase/migrations/<remote_version>_<name>.sql`, using the **remote version** as the filename prefix so local and remote finally agree. Join the statements with `;\n\n`.

Add a one-line header comment to each file recording that it was captured from the remote ledger and on what date, so nobody mistakes a captured file for hand-authored intent.

**Do not edit the SQL.** Not to fix style, not to add `if not exists`, not to correct anything you believe is wrong. If you find something that looks like a bug, report it — do not fix it here. This task's correctness rests entirely on the files matching what actually ran.

- [ ] **Step 3: Verify the capture**

For each new file, confirm its text matches the `statements` it came from. Then:

```sql
select count(*) from supabase_migrations.schema_migrations;
```

Expect 61, unchanged — **this task applies nothing**. If that number moves, something was applied by mistake; stop and report.

Confirm the remote-only list is now empty when re-run against the new filenames.

- [ ] **Step 4: Commit**

One commit for all 17 files.

## Phase 0 done when

1. `pnpm test` passes.
2. `pnpm build` and `pnpm lint` pass.
3. The Task 2 assertion returns `reporter_is_subject = 0`, `pet_dropped = 0`, `submit_overloads = 1`.
4. `storage.objects` carries 13 policies, and `pet-media manager read` actually returns rows for a manager of the pet's building.
5. `docs/RBAC_CAPABILITIES.md` exists and one of its rows has been verified by impersonation.
6. Every applied remote migration has a local file **by name** — the remote-only list from Task 5 Step 1 is empty, and `supabase_migrations.schema_migrations` still holds 61 rows (Task 5 applies nothing).

   **This is name-identity, not content-identity, and the difference is large.** Review hashed all 59 local files against the `statements` that actually ran: only **29 match byte-for-byte** — the 18 captures plus 11 pre-existing. **30 pre-existing files differ in content**, several substantially (`init_schema` 28078 B local vs 24750 B remote; `functions_rls` 23130 vs 20055; `ai_media_retention` 2532 vs 1046; `notification_kind_care` 454 vs 67; `public_building_search` 2190 vs 1112).

   So "every applied migration has a local file" is true; "the local files say what ran" is true for half of them. A fresh reset would replay the *local* text, which for 30 files is not what production ran. Closing that gap is its own task and is deliberately **not** in Phase 0 — recorded here so this gate is never read as more than it is.
7. Every function the app calls appears in `supabase/migrations/`. Check with:

```bash
for fn in submit_incident_report escalate_incident_to_violation \
          incident_status_by_reference resolve_building_code \
          building_pets_for_report my_personas manager_decide_registration; do
  printf '%-34s %s\n' "$fn" "$(grep -rl "function public.$fn" supabase/migrations/ | head -1 || echo MISSING)"
done
```

Expected: no `MISSING`.
