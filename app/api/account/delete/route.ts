import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Delete the CALLER's own account and owned data (PIPEDA / Apple "delete account").
 * Explicitly removes owned rows (avoids FK restrict surprises), then the auth user.
 *
 * ACCOMMODATION DOCUMENTS ARE REMOVED FROM STORAGE HERE, AND THAT IS NOT
 * BELT-AND-BRACES TIDYING — it closes a measured privacy defect.
 *
 * `accommodation_requests.resident_id` is `references profiles(id) on delete
 * cascade` and `accommodation_documents.request_id` is `on delete cascade`, so
 * deleting the auth user erases both rows. A referential cascade is not subject
 * to RLS, and the STORAGE OBJECT is not referential at all: it survives,
 * unreferenced, forever. Measured on production in a rolled-back transaction —
 * requests 0, document rows 0, storage objects 1. A resident asked to be
 * forgotten and the doctor's letter stayed.
 *
 * ORDER MATTERS, AND IT IS NOT THE OBVIOUS ONE. The paths are collected first,
 * the account is deleted second, and the FILES ARE REMOVED LAST. Removing them
 * before the delete would destroy the letter and then, if the delete failed,
 * leave the resident with an account whose evidence had already been wiped.
 * A deletion that half-works is worse than one that fails loudly, and the half
 * that must not happen first is the irreversible one.
 *
 * The daily sweep at /api/accommodations/docs/purge is the BACKSTOP — it
 * removes any object no document row names, after 24 hours. This is the
 * primary, because "eventually" is the wrong answer to a deletion request.
 */
export async function POST() {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = getSupabaseAdmin()
  const uid = user.id

  // Collected BEFORE anything cascades. Once the profile goes, both the request
  // rows and the document rows go with it and there is nothing left to read the
  // paths from.
  //
  // Two plain queries rather than one embedded filter. A filter on an embedded
  // resource is spelled against the ALIAS when one is given and against the
  // table when one is not, and getting that wrong returns EVERY row rather than
  // an error — which here would mean listing another resident's letters for
  // deletion. Two queries cannot be wrong in that direction.
  const { data: myRequests, error: reqError } = await admin
    .from("accommodation_requests")
    .select("id")
    .eq("resident_id", uid)
  // "We couldn't read them" is not "there are none". Refusing here leaves the
  // account intact and the letter intact, which is recoverable; proceeding
  // would delete the account and strand the letter, which is not.
  if (reqError) {
    return NextResponse.json({ error: "Couldn't prepare your data for deletion." }, { status: 502 })
  }
  const requestIds = (myRequests ?? []).map((r) => r.id)

  let paths: string[] = []
  if (requestIds.length > 0) {
    const { data: docs, error: docsError } = await admin
      .from("accommodation_documents")
      .select("storage_path")
      .in("request_id", requestIds)
      .not("storage_path", "is", null)
    if (docsError) {
      return NextResponse.json({ error: "Couldn't prepare your data for deletion." }, { status: 502 })
    }
    paths = (docs ?? []).map((d) => d.storage_path).filter((p): p is string => typeof p === "string")
  }

  // owned data — pets cascade to care_entries / care_targets / vaccinations / documents / contacts
  await admin.from("businesses").delete().eq("owner_id", uid)
  await admin.from("resident_links").delete().eq("profile_id", uid)
  await admin.from("pets").delete().eq("owner_id", uid)

  const { error } = await admin.auth.admin.deleteUser(uid)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Only now, and only for an account that is actually gone.
  if (paths.length > 0) {
    const { error: removeError } = await admin.storage.from("accommodation-docs").remove(paths)
    if (removeError) {
      // The account is gone; the files are not. Say so rather than answering
      // ok:true, and leave the sweep to finish the job — the objects are
      // unreferenced now, so it will take them within 24 hours.
      console.error("[account] deleted the account but not its accommodation documents", removeError)
      return NextResponse.json(
        { ok: true, warning: "Your account is deleted. Some attached documents will be removed within 24 hours." },
        { status: 200 },
      )
    }
  }

  return NextResponse.json({ ok: true })
}
