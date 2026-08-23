# Phase 1 — Evidence, in one composer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A person reporting an incident — signed in or not — is asked for photos, those photos reach the building manager, and nobody else can read them.

**Architecture:** Phases 1 and 2 of the roadmap are merged. Building evidence into two separate report flows and then collapsing them would do the work twice; the duplication is also what caused the bug. So one `IncidentComposer` is built with evidence in it, and both existing screens become thin shells around it. Uploads use server-minted signed upload URLs, because a guest has no Supabase session and Vercel caps a request body at ~4.5 MB.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Supabase Postgres 17, `sonner`, `lucide-react`, pnpm 9 via corepack.

**Spec:** [`docs/superpowers/specs/2026-08-21-completing-manager-resident-flows-design.md`](../specs/2026-08-21-completing-manager-resident-flows-design.md) — AD-1, AD-2, AD-3.

**Roadmap:** [`docs/superpowers/plans/2026-08-21-pet10x-completion-roadmap.md`](./2026-08-21-pet10x-completion-roadmap.md)

## Global Constraints

- **pnpm needs `PATH="$HOME/.corepack-bin:$PATH"`.** Active version is 9.15.9; do not change it. No Supabase CLI, no Docker — migrations go through the Supabase MCP (`apply_migration`), assertions through `execute_sql`.
- **Supabase project:** `Pet10x`, ref `ekgejmxgnlmdomkpblki`. Migrations apply to it directly; the human partner has authorised this.
- **RLS is the floor, the query is the filter.** Every read names its scope.
- **A control that cannot act must not exist.** No `toast()` standing in for a mutation.
- **Cross-user writes go through `SECURITY DEFINER`.** The `notifications` insert policy admits only `kind = 'assistant'` for self.
- **`guest-evidence` has exactly one policy and it is SELECT.** Uploads arrive only through a server-minted signed URL. Do not add a client INSERT policy — a guest has no `auth.uid()` to scope one against.
- **Evidence is readable by managers of that building only.** Not the reporter, not the accused.
- **Never edit an applied migration.** Corrections land as a new one.

---

## Task 1: Evidence parameter on the intake RPC

**Files:**
- Create: `supabase/migrations/20260822000000_incident_evidence.sql`

**Interfaces:**
- Produces: `submit_incident_report(p_building_code text, p_type text, p_description text, p_location text default null, p_unit text default null, p_anonymous boolean default true, p_pet_id uuid default null, p_evidence_paths text[] default '{}')` returning the same `jsonb` shape as today (`{ok, reference}` / `{ok:false, error}`).

- [ ] **Step 1: Write the failing assertion**

Via `execute_sql` on `ekgejmxgnlmdomkpblki`:

```sql
select pg_get_function_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='submit_incident_report';
```

Expected failure: the argument list ends at `p_pet_id uuid DEFAULT NULL::uuid` — no evidence parameter.

- [ ] **Step 2: Write the migration**

Take the current body from `supabase/migrations/20260821000000_capture_incident_rpcs_and_fix_escalation.sql` and change only what is listed here. Keep `security definer`, keep `set search_path to 'public'`, keep every existing validation.

Add the parameter last so existing positional callers are unaffected:

```sql
p_evidence_paths text[] default '{}'
```

Before the insert, validate every path against the building that the code resolved to. A path that does not belong to this building is a caller trying to claim someone else's upload:

```sql
  -- Evidence lands in guest-evidence under {buildingId}/{draftId}/…, uploaded
  -- through a signed URL this building's code authorised. Anything with a
  -- different prefix was not ours to attach.
  if array_length(p_evidence_paths, 1) is not null then
    if array_length(p_evidence_paths, 1) > 5 then
      return jsonb_build_object('ok', false, 'error', 'too_many_files');
    end if;
    foreach v_path in array p_evidence_paths loop
      if v_path is null or v_path not like (v_building::text || '/%') then
        return jsonb_build_object('ok', false, 'error', 'bad_evidence_path');
      end if;
    end loop;
  end if;
```

Declare `v_path text;` alongside the existing declarations. Write `coalesce(p_evidence_paths, '{}')` into the insert's `evidence_paths` column, and add `'evidence_count', coalesce(array_length(p_evidence_paths,1), 0)` to the `audit_log` metadata object.

- [ ] **Step 3: Apply**

`apply_migration`, name `incident_evidence`.

- [ ] **Step 4: Verify — including both rejections**

```sql
select pg_get_function_arguments(p.oid) from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='submit_incident_report';
```

Expected: ends with `p_evidence_paths text[] DEFAULT '{}'::text[]`, and exactly **one** overload exists.

Then prove the guard rejects a foreign prefix, inside a transaction you roll back:

```sql
begin;
select public.submit_incident_report('MCR2026','noise','guard probe', null, null, true, null,
  array['00000000-0000-0000-0000-000000000000/draft/1.jpg']);
rollback;
```

Expected: `{"ok": false, "error": "bad_evidence_path"}` — **no row inserted**. Also probe six paths for `too_many_files`. Then confirm a well-formed call still succeeds and writes `evidence_paths`, and roll that back too.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260822000000_incident_evidence.sql
git commit -m "Let a report carry what the reporter saw"
```

---

## Task 2: The two server routes

**Files:**
- Create: `app/api/incidents/evidence/sign/route.ts`
- Create: `app/api/report/pets/route.ts`

**Interfaces:**
- Produces: `POST /api/incidents/evidence/sign` — body `{ buildingCode: string, draftId: string, files: {name: string, type: string, size: number}[] }` → `{ ok: true, uploads: {path: string, token: string}[] }` or `{ ok: false, error: string }` with an HTTP status.
- Produces: `GET /api/report/pets?code=<buildingCode>` → `{ ok: true, pets: {id, name, species, breed, photoUrl: string|null}[] }`. `photoUrl` is a signed URL or null.

Both use `getSupabaseAdmin()` from `lib/supabase/admin.ts`. Follow the shape of `app/api/manager/request-info/route.ts` — validate, act, return `NextResponse.json`.

- [ ] **Step 1: Write the sign route**

```ts
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Mint upload URLs for incident evidence.
 *
 * A guest reporter has no Supabase session — `signInGuest` is client state and
 * the project has no anonymous auth users — so `auth.uid()` is null for them
 * and no owner-scoped storage policy could ever admit their upload. And a
 * serverless request body caps at ~4.5 MB, which a phone photo clears easily.
 * So the server mints a short-lived signed upload URL and the browser PUTs
 * straight to storage. `guest-evidence` therefore carries no client INSERT
 * policy at all: an upload can only happen through a URL minted here.
 *
 * Possession of the building code is the authorisation, exactly as it is for
 * filing the report itself.
 */
const MAX_FILES = 5
const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 })

  const body = (await request.json().catch(() => null)) as {
    buildingCode?: string
    draftId?: string
    files?: { name?: string; type?: string; size?: number }[]
  } | null

  if (!body?.buildingCode || !body.draftId || !Array.isArray(body.files)) {
    return NextResponse.json({ ok: false, error: "buildingCode, draftId and files are required." }, { status: 400 })
  }
  if (!UUID.test(body.draftId)) {
    return NextResponse.json({ ok: false, error: "draftId must be a uuid." }, { status: 400 })
  }
  if (body.files.length === 0 || body.files.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `Between 1 and ${MAX_FILES} files.` }, { status: 400 })
  }
  for (const f of body.files) {
    if (!f.type || !ALLOWED.has(f.type)) {
      return NextResponse.json({ ok: false, error: "Photos only (JPEG, PNG, WebP or HEIC)." }, { status: 400 })
    }
    if (typeof f.size !== "number" || f.size <= 0 || f.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Each photo must be under 15 MB." }, { status: 400 })
    }
  }

  // The code is the authorisation. Resolve it the same way intake does.
  const { data: resolved } = await admin.rpc("resolve_building_code", { p_code: body.buildingCode })
  const r = resolved as unknown as { valid?: boolean; building_id?: string } | null
  if (!r?.valid || !r.building_id) {
    return NextResponse.json({ ok: false, error: "That building code isn't recognised." }, { status: 404 })
  }

  const uploads: { path: string; token: string }[] = []
  for (let i = 0; i < body.files.length; i++) {
    const ext = extFor(body.files[i].type!)
    const path = `${r.building_id}/${body.draftId}/${i}-${Date.now()}.${ext}`
    const { data, error } = await admin.storage.from("guest-evidence").createSignedUploadUrl(path)
    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Couldn't prepare the upload." }, { status: 502 })
    }
    uploads.push({ path: data.path, token: data.token })
  }

  return NextResponse.json({ ok: true, uploads })
}

function extFor(mime: string): string {
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/heic" || mime === "image/heif") return "heic"
  return "jpg"
}
```

- [ ] **Step 2: Write the pets route**

`building_pets_for_report` returns storage paths, and a guest has no session with which to sign them — which is why the picker renders no photos today. Signing is a Storage API operation, not something SQL can do, so a thin server route wraps the RPC.

```ts
import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Pets a reporter may point at, with photos that actually resolve.
 *
 * The RPC is the privacy guarantee — it returns name, species, breed and a
 * photo path, and never a unit, an owner or a contact. This route adds only
 * the signing, because a guest holds no session and `createSignedUrl` needs
 * one. Signing cannot be done in SQL.
 */
export async function GET(request: Request) {
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 })

  const code = new URL(request.url).searchParams.get("code")
  if (!code) return NextResponse.json({ ok: false, error: "code is required." }, { status: 400 })

  const { data, error } = await admin.rpc("building_pets_for_report", { p_code: code })
  if (error) return NextResponse.json({ ok: false, error: "Couldn't load pets." }, { status: 502 })

  const r = data as unknown as {
    valid?: boolean
    pets?: { id: string; name: string; species: string; breed: string | null; photo: string | null }[]
  } | null
  if (!r?.valid) return NextResponse.json({ ok: true, pets: [] })

  const pets = r.pets ?? []
  const paths = pets.map((p) => p.photo).filter((p): p is string => !!p && !p.startsWith("/") && !p.startsWith("http"))
  const signed: Record<string, string> = {}
  if (paths.length > 0) {
    const { data: urls } = await admin.storage.from("pet-media").createSignedUrls(paths, 3600)
    for (const u of urls ?? []) if (u.signedUrl && u.path) signed[u.path] = u.signedUrl
  }

  return NextResponse.json({
    ok: true,
    pets: pets.map((p) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      breed: p.breed,
      photoUrl: p.photo ? (signed[p.photo] ?? (p.photo.startsWith("http") ? p.photo : null)) : null,
    })),
  })
}
```

- [ ] **Step 3: Verify both routes**

Start the dev server (`PATH="$HOME/.corepack-bin:$PATH" pnpm dev`) and exercise them with `curl`. Use a real building code — `MCR2026` resolves to Maple Court Residences.

- Sign route, bad code → 404 `That building code isn't recognised.`
- Sign route, non-uuid `draftId` → 400.
- Sign route, `application/pdf` → 400 photos-only.
- Sign route, 6 files → 400.
- Sign route, valid → 200 with one `{path, token}` per file, each `path` beginning with the building's uuid.
- Pets route, `?code=MCR2026` → 200, 10 pets, **at least one with a non-null `photoUrl`** (today exactly one pet has a photo). That non-null value is the whole point of the route — if every `photoUrl` is null, the signing failed.
- Pets route, bad code → 200 with `pets: []`.

Record every command and its output.

- [ ] **Step 4: Commit**

```bash
git add app/api/incidents/evidence/sign/route.ts app/api/report/pets/route.ts
git commit -m "Mint the upload, sign the photo"
```

---

## Task 3: The composer

**Files:**
- Create: `components/screens/report/incident-composer.tsx`
- Create: `lib/data/evidence.ts`

**Interfaces:**
- Consumes: `POST /api/incidents/evidence/sign` and `GET /api/report/pets` from Task 2; `submit_incident_report`'s new parameter from Task 1.
- Produces: `<IncidentComposer building={{ code, name }} onDone={() => void} onBack={() => void} />` — a complete four-step report flow. Both report screens render it.
- Produces from `lib/data/evidence.ts`: `uploadEvidence(buildingCode: string, draftId: string, files: File[]): Promise<{ paths: string[]; error: string | null }>` and `reportablePetsSigned(code: string): Promise<{ pets: ReportablePet[]; error: string | null }>`.

  **Signature corrected during execution.** `reportablePetsSigned` originally returned a bare `ReportablePet[]`, mapping every failure to `[]`. Review showed that renders a signing outage as *"No registered pets to choose from"* — telling a reporter who could have identified the dog that there was nothing to identify. The information simply was not in the old return type, so the honest fix was to widen it. Only the composer consumes this.

- [ ] **Step 1: Write `lib/data/evidence.ts`**

```ts
"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { ReportablePet } from "./incidents"

/**
 * Upload evidence for a report that does not exist yet.
 *
 * The report gets its id at submit time, so uploads are keyed by a
 * client-generated draft id and claimed by the RPC afterwards. Anything never
 * claimed is swept by the purge route.
 */
export async function uploadEvidence(
  buildingCode: string,
  draftId: string,
  files: File[],
): Promise<{ paths: string[]; error: string | null }> {
  if (files.length === 0) return { paths: [], error: null }

  const res = await fetch("/api/incidents/evidence/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buildingCode,
      draftId,
      files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    }),
  })
  const json = (await res.json().catch(() => null)) as
    | { ok: boolean; uploads?: { path: string; token: string }[]; error?: string }
    | null
  if (!json?.ok || !json.uploads) return { paths: [], error: json?.error ?? "Couldn't prepare the upload." }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { paths: [], error: "Storage is not configured." }

  const paths: string[] = []
  for (let i = 0; i < files.length; i++) {
    const { path, token } = json.uploads[i]
    const { error } = await supabase.storage
      .from("guest-evidence")
      .uploadToSignedUrl(path, token, files[i], { contentType: files[i].type })
    // One failure must not lose the others, nor the written report.
    if (!error) paths.push(path)
  }
  if (paths.length === 0) return { paths: [], error: "The photos didn't upload." }
  return { paths, error: null }
}

/** Pets to point at, with photos signed server-side (a guest cannot sign). */
export async function reportablePetsSigned(code: string): Promise<ReportablePet[]> {
  const res = await fetch(`/api/report/pets?code=${encodeURIComponent(code)}`)
  const json = (await res.json().catch(() => null)) as { ok: boolean; pets?: ReportablePet[] } | null
  // A failure is not "no pets". Returning [] for both tells someone who could
  // have identified the animal that there was nothing to identify.
  if (!json?.ok) return { pets: [], error: "Couldn't load the pets for this building." }
  return { pets: json.pets ?? [], error: null }
}
```

- [ ] **Step 2: Write the composer**

Build `components/screens/report/incident-composer.tsx` as a four-step flow — `type → evidence → pet → summary` — modelled on the existing `components/screens/guest-report-screen.tsx`, which already has that structure and its step chrome. Reuse its `INCIDENT_TYPES` array, its progress bar, its GPS `handleUseLocation`, its pet grid and its summary card. Read that file and carry the working parts across rather than reinventing them.

What changes from that file:

1. **Real file input.** Replace `handlePhotoAdd`, which pushes the string `"/pets/dog1.jpg"`, with a hidden `<input type="file" accept="image/*" multiple>` and a `File[]` state. Render previews with `URL.createObjectURL`, and revoke each object URL when its photo is removed or the component unmounts.
2. **Downscale before upload.** Long edge 1600px, JPEG quality 0.82, via a canvas. Phone photos are several MB and the manager is viewing them on a phone.
3. **Upload on submit, not on pick.** Call `uploadEvidence` first, then `submitIncident` with the returned paths. If upload fails but the description exists, tell the reporter and let them send without photos — never lose a written report over a failed image.
4. **Pets from `reportablePetsSigned`**, not `reportablePets`.
5. **`building` is a prop**, so the screen above decides whether a code was needed.
6. **Anonymous defaults to `false`** for a signed-in resident and `true` for a guest — pass it in as `defaultAnonymous`.

The summary step must show the real photo count from state, not a hardcoded number, and the description text itself.

- [ ] **Step 3: Write the failing test**

Create `lib/data/evidence.test.ts`. `uploadEvidence` is the piece with real branching and it is testable by stubbing `fetch` and the storage client.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

const uploadToSignedUrl = vi.fn()
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }),
}))

import { uploadEvidence } from "./evidence"

const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" })

describe("uploadEvidence", () => {
  beforeEach(() => {
    uploadToSignedUrl.mockReset()
    vi.stubGlobal("fetch", vi.fn())
  })

  it("uploads nothing and reports no error when there are no files", async () => {
    const res = await uploadEvidence("MCR2026", "d", [])
    expect(res).toEqual({ paths: [], error: null })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("returns the paths that uploaded", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ ok: true, uploads: [{ path: "b/d/0.jpg", token: "t" }] }),
    } as Response)
    uploadToSignedUrl.mockResolvedValue({ error: null })
    const res = await uploadEvidence("MCR2026", "d", [file("a.jpg")])
    expect(res).toEqual({ paths: ["b/d/0.jpg"], error: null })
  })

  it("keeps the photos that succeeded when one fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({
        ok: true,
        uploads: [
          { path: "b/d/0.jpg", token: "t" },
          { path: "b/d/1.jpg", token: "t" },
        ],
      }),
    } as Response)
    uploadToSignedUrl.mockResolvedValueOnce({ error: new Error("boom") }).mockResolvedValueOnce({ error: null })
    const res = await uploadEvidence("MCR2026", "d", [file("a.jpg"), file("b.jpg")])
    expect(res.paths).toEqual(["b/d/1.jpg"])
    expect(res.error).toBeNull()
  })

  it("surfaces the server's refusal", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ ok: false, error: "That building code isn't recognised." }),
    } as Response)
    const res = await uploadEvidence("NOPE", "d", [file("a.jpg")])
    expect(res.paths).toEqual([])
    expect(res.error).toBe("That building code isn't recognised.")
  })
})
```

- [ ] **Step 4: Run it, watch it fail, then pass**

`PATH="$HOME/.corepack-bin:$PATH" pnpm test` — expect failure before `lib/data/evidence.ts` exists, then 4 passing (19 total).

- [ ] **Step 5: Commit**

```bash
git add components/screens/report/incident-composer.tsx lib/data/evidence.ts lib/data/evidence.test.ts
git commit -m "One way to file a report, and it asks for photos"
```

---

## Task 4: Both screens become shells

**Files:**
- Modify: `components/screens/report/report-screen.tsx`
- Modify: `components/screens/guest-report-screen.tsx`
- Modify: `lib/data/incidents.ts:94-133` (`submitIncident` gains `evidencePaths`)

**Interfaces:**
- Consumes: `<IncidentComposer>` from Task 3.
- Produces: `submitIncident(input: { …existing…, evidencePaths?: string[] })` passing `p_evidence_paths`.

- [ ] **Step 1: Add the parameter to `submitIncident`**

In `lib/data/incidents.ts`, add `evidencePaths?: string[]` to the input type and `p_evidence_paths: input.evidencePaths ?? []` to the `rpc` call. Map the two new server errors to sentences a person can act on: `too_many_files` → "You can attach up to 5 photos."; `bad_evidence_path` → "Those photos couldn't be attached — please try again."

- [ ] **Step 2: Reduce `report-screen.tsx` to a shell**

Delete the entire `BuildingReport` function (lines 84-244) and render the composer in its place:

```tsx
{view === "building" && building && (
  <IncidentComposer
    building={building}
    defaultAnonymous={false}
    onBack={() => setView("choose")}
    onDone={onBack}
  />
)}
```

The loading state, `myBuildingCode()` lookup, `ReportChooser` and municipal branch all stay exactly as they are.

- [ ] **Step 3: Reduce `guest-report-screen.tsx` to a shell**

Keep the nav bar, the building name, the sign-out button and the post-submit success screen with its reference code and SPCA link — those are guest-specific. Replace the four step bodies with the composer, passing `defaultAnonymous={true}` and the building from `guestSession`.

- [ ] **Step 4: Verify in the running app**

`pnpm dev`, then walk both paths end to end:

- **Guest:** sign in with `MCR2026` → pick a type → attach two photos → confirm the summary counts two → send. Then confirm in SQL that the new row's `evidence_paths` has two entries, both prefixed with the building's uuid.
- **Resident:** sign in, Report → My building → same walk. Confirm the same.
- **Pet picker:** confirm at least one pet tile renders a real photo rather than the fallback icon. This is the AD-3 fix and it is visible.

- [ ] **Step 5: Commit**

```bash
git add components/screens/report/report-screen.tsx components/screens/guest-report-screen.tsx lib/data/incidents.ts
git commit -m "Both ways in, one way through"
```

---

## Task 5: The manager sees it

**Files:**
- Modify: `components/screens/manager/incident-card.tsx`
- Modify: `lib/data/incidents.ts` (`ManagerIncident` gains `evidenceUrls`, `useIncidents` signs them)

**Interfaces:**
- Consumes: `incident_reports.evidence_paths`, populated by Task 4.
- Produces: `ManagerIncident.evidenceUrls: string[]` — signed, one hour.

- [ ] **Step 1: Select and sign the paths**

In `useIncidents`, add `evidence_paths` to the select list. After the existing pet-photo signing block, sign the evidence in one batch from the `guest-evidence` bucket:

```ts
const evidencePaths = mapped.flatMap((m) => m.evidencePaths)
if (evidencePaths.length > 0) {
  const { data: urls } = await supabase.storage.from("guest-evidence").createSignedUrls(evidencePaths, 3600)
  const signed: Record<string, string> = {}
  for (const u of urls ?? []) if (u.signedUrl && u.path) signed[u.path] = u.signedUrl
  for (const m of mapped) m.evidenceUrls = m.evidencePaths.map((p) => signed[p]).filter(Boolean)
}
```

The manager holds a session and `guest-evidence manager read` admits them, so this signs successfully where a reporter's would not.

- [ ] **Step 2: Render a thumbnail strip**

In `incident-card.tsx`, below the description and above the action row, render the evidence when `incident.evidenceUrls.length > 0` — a horizontal strip of square thumbnails, each opening full size in a new tab. Say how many there are. When there are none, render nothing at all rather than an empty state; most reports will have none.

- [ ] **Step 3: Verify**

With the report filed in Task 4, open the manager's Approvals → Incidents tab as a manager of that building and confirm the thumbnails render and open. Then confirm a manager of a *different* building sees that incident not at all (RLS already scopes the query).

- [ ] **Step 4: Commit**

```bash
git add components/screens/manager/incident-card.tsx lib/data/incidents.ts
git commit -m "Show the manager what the reporter saw"
```

---

## Task 6: Sweep unclaimed drafts

**Files:**
- Create: `app/api/incidents/evidence/purge/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `incident_reports.evidence_paths` as the claim record.
- Produces: a cron endpoint returning `{ ok: true, deleted: number }`.

Uploads happen before the report exists, so an abandoned flow leaves objects nothing points at. Model this on `app/api/ai/media/purge/route.ts`, which already does exactly this shape of sweep — read it first and follow its authorisation pattern.

- [ ] **Step 1: Write the route**

List `guest-evidence` recursively, keep objects older than 24 hours whose path appears in no `incident_reports.evidence_paths`, and remove those. Anything younger than 24 hours is left alone — a reporter may still be composing.

- [ ] **Step 2: Register the cron**

Add to `vercel.json`, beside the two existing entries:

```json
{ "path": "/api/incidents/evidence/purge", "schedule": "0 4 * * *" }
```

- [ ] **Step 3: Verify**

Upload evidence via the sign route without submitting a report. Confirm the object exists, that a purge run leaves it alone (younger than 24h), and — by temporarily passing a cutoff override, or by asserting the query that selects candidates — that it *would* be selected once old enough. Then confirm a claimed path is never a candidate.

- [ ] **Step 4: Commit**

```bash
git add app/api/incidents/evidence/purge/route.ts vercel.json
git commit -m "Sweep the photos nobody sent"
```

---

## Phase 1 done when

1. `pnpm test` passes (19 tests) and `pnpm build` exits 0.
2. A **guest** with only a building code can attach photos to a report, and those paths land in `incident_reports.evidence_paths`.
3. A **signed-in resident** gets the same four steps — the flow that previously had no evidence step at all.
4. Both screens render the same `IncidentComposer`; `BuildingReport` no longer exists.
5. A manager of that building sees the photos. A manager of another building cannot read the objects.
6. The pet picker shows real photos, not fallback icons.
7. `submit_incident_report` rejects a path prefixed with a different building, and rejects more than five.
