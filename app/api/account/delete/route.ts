import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { deletionBlocker, isOwnCommunityObject, objectPaths } from "@/lib/account-deletion"

/**
 * Delete the CALLER's own account, their owned data and their files (PIPEDA /
 * Apple "delete account").
 *
 * WHAT HAPPENS, IN ORDER, AND WHY THAT ORDER.
 *
 *   1. REFUSE, having touched nothing, if a bylaw case about the caller is
 *      still open, a fine is still owed or disputed, or a business they own
 *      has bookings still to answer, other active staff, or clinic patient
 *      records — deleting the owner deletes the business, and its clinic
 *      records cascade with it (`deletionBlocker`). The person is told
 *      why in one sentence.
 *   2. COLLECT every storage path the account owns while the rows that name
 *      them still exist. Once the profile goes, the rows cascade or lose their
 *      author and there is nothing left to read the paths from.
 *   3. DELETE pets, businesses and resident links, then the auth user. The
 *      profile cascades from `auth.users`.
 *   4. REMOVE the files, LAST, and only for an account that is actually gone.
 *
 * Removing files before the delete would destroy them and then, if the
 * delete failed, leave a live account whose evidence had been wiped — an
 * accommodation request whose letter is gone, a pet whose vaccination record
 * points at nothing. The bytes must not outlive the account, and they must not
 * predecease it either.
 *
 * WHAT IS KEPT, AND WHY IT NO LONGER BLOCKS (20261012000001). Every foreign
 * key into `profiles` is now CASCADE (what the person owns) or SET NULL (what
 * they did, and what a record is about). A closed case, a paid fine, a decided
 * appeal, an incident they reported, a booking they made, a payment, a manager
 * decision they signed, an audit row — the record stays and says nobody. A
 * removed pet leaves its cases standing with no pet named
 * (`violations.pet_id`), and a removed business leaves its customers' booking
 * history with no business named (`service_bookings.business_id`). The guards
 * that read a referential SET NULL as an edit (fines, community attribution)
 * admit exactly that write and no other — see the migration's header.
 *
 * Before that migration 21 of 48 live profiles could not be deleted, refused
 * at `violations_pet_id_fkey`, `service_bookings_business_id_fkey`,
 * `incident_reports_reporter_id_fkey`, `resident_links_decided_by_fkey`,
 * `building_managers_granted_by_fkey` or `payments_profile_id_fkey`. The
 * three explicit deletes below still commit independently of `deleteUser` (a
 * GoTrue call, not SQL), so a failure there could still leave rows removed;
 * with no NO ACTION key left in the path the expected failures are gone, and
 * any that remains is logged and answered with the generic sentence.
 *
 * FILES, BY BUCKET:
 *   pet-media           everything under `{uid}/` — pet photos, documents,
 *                       vaccination scans and AI chat attachments, which all
 *                       upload as `{uid}/{petId}/…` (lib/supabase/storage.ts)
 *   avatars             everything under `{uid}/` (lib/data/account.ts)
 *   accommodation-docs  the storage_path of every document on the caller's
 *                       requests — read from the rows, as before
 *   community-media     `{buildingId}/{uid}/…`: the images on posts and
 *                       lost-and-found reports they wrote, plus anything left
 *                       in their folder under every building they belonged to
 *   guest-evidence      the evidence_paths of incidents they reported while
 *                       signed in; the report itself stays, de-identified,
 *                       with its paths cleared so nothing signs a dead file
 *
 * The purge routes are BACKSTOPS: /api/accommodations/docs/purge and
 * /api/incidents/evidence/purge take unreferenced objects after 24 hours, and
 * /api/ai/media/purge takes chat photos after the retention window. This is
 * the primary, because "eventually" is the wrong answer to a deletion request.
 */

/**
 * One sentence for every way this can be refused unexpectedly. A raw Postgres
 * constraint name is a diagnostic, not something to show a person who asked
 * to be forgotten, and it goes to the log instead.
 */
function refuse(stage: string, detail: string) {
  console.error(`[account] deletion refused at ${stage}`, detail)
  return NextResponse.json(
    { error: "We couldn't delete your account. Please contact support so we can finish it for you." },
    { status: 400 },
  )
}

const PREPARE_FAILED = "Couldn't prepare your data for deletion. Try again in a moment."

type Admin = ReturnType<typeof getSupabaseAdmin>

/**
 * Every object under `prefix` in `bucket`, descending into folders. Storage
 * `list` is one level deep and pages at 1000; a folder comes back with a null
 * id. Depth is bounded because no path grammar here is deeper than three.
 */
async function listUnder(admin: Admin, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 3) return []
  const out: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`)
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`
      if (item.id === null) out.push(...(await listUnder(admin, bucket, path, depth + 1)))
      else out.push(path)
    }
    if (!data || data.length < 1000) break
  }
  return out
}

export async function POST() {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = getSupabaseAdmin()
  const uid = user.id

  // ---------------------------------------------------------------------
  // 1. Anything that must be closed first. "We couldn't check" is not
  //    "there is nothing", so a failed read refuses rather than proceeds.
  // ---------------------------------------------------------------------
  const [casesRes, finesRes, bizRes] = await Promise.all([
    admin.from("violations").select("stage, building:buildings ( name )").eq("resident_id", uid),
    admin.from("fines").select("status, building:buildings ( name )").eq("resident_id", uid),
    admin.from("businesses").select("id").eq("owner_id", uid),
  ])
  if (casesRes.error || finesRes.error || bizRes.error) {
    return NextResponse.json({ error: PREPARE_FAILED }, { status: 502 })
  }
  const businessIds = (bizRes.data ?? []).map((b) => b.id)
  let businessBookings: { status: string }[] = []
  let businessDependants = { otherActiveStaff: 0, patients: 0 }
  if (businessIds.length > 0) {
    const [bookings, staff, patients] = await Promise.all([
      admin.from("service_bookings").select("status").in("business_id", businessIds),
      admin
        .from("business_staff")
        .select("id", { count: "exact", head: true })
        .in("business_id", businessIds)
        .eq("is_active", true)
        .neq("profile_id", uid),
      admin.from("clinic_patients").select("id", { count: "exact", head: true }).in("business_id", businessIds),
    ])
    if (bookings.error || staff.error || patients.error) {
      return NextResponse.json({ error: PREPARE_FAILED }, { status: 502 })
    }
    businessBookings = bookings.data ?? []
    businessDependants = { otherActiveStaff: staff.count ?? 0, patients: patients.count ?? 0 }
  }
  type Named = { building: { name: string } | { name: string }[] | null }
  const buildingName = (r: Named) => (Array.isArray(r.building) ? r.building[0]?.name : r.building?.name) ?? null
  const blocker = deletionBlocker({
    cases: ((casesRes.data ?? []) as unknown as (Named & { stage: string })[]).map((r) => ({
      stage: r.stage,
      buildingName: buildingName(r),
    })),
    fines: ((finesRes.data ?? []) as unknown as (Named & { status: string })[]).map((r) => ({
      status: r.status,
      buildingName: buildingName(r),
    })),
    businessBookings,
    businessDependants,
  })
  if (blocker) return NextResponse.json({ error: blocker }, { status: 409 })

  // ---------------------------------------------------------------------
  // 2. Every path, collected before anything cascades.
  //
  // Plain queries per table rather than embedded filters: a filter on an
  // embedded resource that is spelled wrong returns EVERY row rather than an
  // error — which here would mean listing another resident's files for
  // deletion. A plain `.eq` on the caller's own column cannot be wrong in
  // that direction.
  // ---------------------------------------------------------------------
  let accomPaths: string[] = []
  let petMediaPaths: string[] = []
  let avatarPaths: string[] = []
  let communityPaths: string[] = []
  let evidencePaths: string[] = []
  let evidenceIncidentIds: string[] = []
  try {
    const { data: myRequests, error: reqError } = await admin
      .from("accommodation_requests")
      .select("id")
      .eq("resident_id", uid)
    if (reqError) throw new Error(reqError.message)
    const requestIds = (myRequests ?? []).map((r) => r.id)
    if (requestIds.length > 0) {
      const { data: docs, error: docsError } = await admin
        .from("accommodation_documents")
        .select("storage_path")
        .in("request_id", requestIds)
        .not("storage_path", "is", null)
      if (docsError) throw new Error(docsError.message)
      accomPaths = objectPaths((docs ?? []).map((d) => d.storage_path))
    }

    petMediaPaths = await listUnder(admin, "pet-media", uid)
    avatarPaths = await listUnder(admin, "avatars", uid)

    const [posts, lost, links, managed, incidents] = await Promise.all([
      admin.from("community_posts").select("image_url").eq("author_id", uid),
      admin.from("lost_found").select("image_url").eq("reporter_id", uid),
      admin.from("resident_links").select("building_id").eq("profile_id", uid),
      admin.from("building_managers").select("building_id").eq("profile_id", uid),
      admin.from("incident_reports").select("id, evidence_paths").eq("reporter_id", uid),
    ])
    for (const r of [posts, lost, links, managed, incidents]) if (r.error) throw new Error(r.error.message)

    const buildingIds = [
      ...new Set([...(links.data ?? []), ...(managed.data ?? [])].map((r) => r.building_id)),
    ]
    const folders: string[] = []
    for (const b of buildingIds) folders.push(...(await listUnder(admin, "community-media", `${b}/${uid}`)))
    communityPaths = objectPaths([
      ...(posts.data ?? []).map((p) => p.image_url),
      ...(lost.data ?? []).map((l) => l.image_url),
      ...folders,
    ]).filter((p) => isOwnCommunityObject(p, uid))

    const withEvidence = (incidents.data ?? []).filter((i) => (i.evidence_paths ?? []).length > 0)
    evidenceIncidentIds = withEvidence.map((i) => i.id)
    evidencePaths = objectPaths(withEvidence.flatMap((i) => i.evidence_paths ?? []))
  } catch (e) {
    console.error("[account] couldn't collect files for deletion", e)
    return NextResponse.json({ error: PREPARE_FAILED }, { status: 502 })
  }

  // ---------------------------------------------------------------------
  // 3. Owned rows, then the account. Pets first: deleting them cascades
  //    care entries, vaccinations, documents and contacts.
  // ---------------------------------------------------------------------
  const petsDelete = await admin.from("pets").delete().eq("owner_id", uid)
  if (petsDelete.error) return refuse("pets", petsDelete.error.message)

  const businessesDelete = await admin.from("businesses").delete().eq("owner_id", uid)
  if (businessesDelete.error) return refuse("businesses", businessesDelete.error.message)

  const linksDelete = await admin.from("resident_links").delete().eq("profile_id", uid)
  if (linksDelete.error) return refuse("resident_links", linksDelete.error.message)

  const { error } = await admin.auth.admin.deleteUser(uid)
  if (error) return refuse("deleteUser", error.message)

  // ---------------------------------------------------------------------
  // 4. Only now, and only for an account that is actually gone.
  // ---------------------------------------------------------------------
  const removals: [string, string[]][] = [
    ["accommodation-docs", accomPaths],
    ["pet-media", petMediaPaths],
    ["avatars", avatarPaths],
    ["community-media", communityPaths],
    ["guest-evidence", evidencePaths],
  ]
  let incomplete = false
  for (const [bucket, paths] of removals) {
    for (let i = 0; i < paths.length; i += 500) {
      const { error: removeError } = await admin.storage.from(bucket).remove(paths.slice(i, i + 500))
      if (removeError) {
        console.error(`[account] deleted the account but not all of its files in ${bucket}`, removeError)
        incomplete = true
      }
    }
  }
  if (evidenceIncidentIds.length > 0) {
    // The report stays (reporter_id is now null); the photos it named do not.
    const { error: clearError } = await admin
      .from("incident_reports")
      .update({ evidence_paths: [] })
      .in("id", evidenceIncidentIds)
    if (clearError) console.error("[account] couldn't clear evidence paths", clearError)
  }

  if (incomplete) {
    // The account is gone; some files are not. Say so rather than answering a
    // bare ok. The evidence and accommodation sweeps take theirs within a day;
    // pet-media and avatars have no sweep, so the log line is the trail.
    return NextResponse.json(
      {
        ok: true,
        warning: "Your account is deleted, but some files couldn't be removed yet. Contact support and we'll finish it.",
      },
      { status: 200 },
    )
  }
  return NextResponse.json({ ok: true })
}
