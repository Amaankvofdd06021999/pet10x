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
 * THE SWEEP IS NOT MOVED BEFORE THE DELETE, AND IT WAS ASKED FOR. The argument
 * for moving it is that an account which cannot be deleted never reaches the
 * sweep, so the letters stay. True — but the account stays too. Removing the
 * files first would leave a LIVE resident with a live accommodation request
 * whose supporting letter had been destroyed, so the manager can no longer
 * decide it and an approved accommodation loses the evidence behind it. The
 * bytes must not outlive the account, and they must not predecease it either.
 * The order above is deliberate and stays.
 *
 * The daily sweep at /api/accommodations/docs/purge is the BACKSTOP — it
 * removes any object no document row names, after 24 hours. This is the
 * primary, because "eventually" is the wrong answer to a deletion request.
 * The backstop only fires for accounts that WERE deleted: the request and
 * document rows cascade away, the objects become unreferenced, and the sweep
 * takes them. For an account whose deletion was refused nothing cascades, the
 * rows still name the paths, and the sweep correctly leaves them alone.
 *
 * WHAT IS STILL BROKEN HERE, MEASURED RATHER THAN ESTIMATED, AND OUT OF SCOPE.
 *
 * `public.profiles` is referenced by 45 foreign keys, of which 20 are NO ACTION
 * and can therefore refuse a deletion: `audit_log.actor_id`,
 * `building_managers.granted_by`, `care_entries.logged_by`,
 * `emergency_access_tokens.issued_by`, `events.created_by`, `fines.issued_by`,
 * `fines.resident_id`, `incident_reports.reporter_id`,
 * `incident_reports.triaged_by`, `lost_found.reporter_id`,
 * `payments.profile_id`, `pet_documents.verified_by`, `profiles.suspended_by`,
 * `resident_links.decided_by`, `service_bookings.customer_id`,
 * `violation_disputes.decided_by`, `violation_disputes.filed_by`,
 * `violation_events.actor_id`, `violations.opened_by` and
 * `violations.resident_id`.
 *
 * Every one of the 48 live profiles was run through this exact sequence in a
 * rolled-back transaction on production. **21 of 48 cannot be deleted.** The
 * step that raises and the constraint that raises there, per account:
 *
 *     pets         violations_pet_id_fkey            10
 *     businesses   service_bookings_business_id_fkey  5  (via businesses, not profiles)
 *     deleteUser   incident_reports_reporter_id_fkey  2
 *     deleteUser   resident_links_decided_by_fkey     2
 *     deleteUser   building_managers_granted_by_fkey  1
 *     deleteUser   payments_profile_id_fkey           1
 *
 * The STEP is half the fact and the earlier version of this list omitted it,
 * which is how it came to name constraints from a sequence this route does not
 * run: `violations_resident_id_fkey` blocks the bare `delete from auth.users`,
 * but under the order below `violations_pet_id_fkey` refuses those accounts one
 * step earlier, at `pets`, where nothing has been lost yet. Same accounts, same
 * total, different constraint and a materially different consequence.
 *
 * `audit_log.actor_id` is NOT the main cause and blocks nobody as things stand
 * — only 4 profiles have ever written an audit row, and each is already refused
 * by a constraint that raises first. Sarah Chen fails at the FIRST step, on
 * `violations_pet_id_fkey`, having deleted nothing.
 *
 * AND SHE IS THE ONE WHO MATTERS: all 3 objects currently in
 * `accommodation-docs` are hers, including two `esa_letter` PDFs. So today the
 * PIPEDA path for accommodation documents is unreachable for 100% of the
 * documents that exist. That is not fixed by anything in this file; it is fixed
 * by deciding whether an audit trail may say "somebody" where it named a person,
 * which is a real decision and not a one-liner. Reported, not guessed at.
 */
/**
 * One sentence for every way this can be refused. A raw Postgres constraint
 * name is a diagnostic, not something to show a person who asked to be
 * forgotten, and it goes to the log instead.
 */
function refuse(stage: string, detail: string) {
  console.error(`[account] deletion refused at ${stage}`, detail)
  return NextResponse.json(
    { error: "We couldn't delete your account. Please contact support so we can finish it for you." },
    { status: 400 },
  )
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

  // owned data — pets cascade to care_entries / care_targets / vaccinations /
  // documents / contacts.
  //
  // PETS FIRST, AND EVERY ERROR CHECKED. These three deletes are separate
  // PostgREST calls that COMMIT INDEPENDENTLY; there is no transaction spanning
  // them and `deleteUser`, because the last one is a GoTrue API call and not
  // SQL. Their errors used to be discarded and `pets` used to run LAST, which
  // meant a caller whose deletion was about to be refused had already lost their
  // building membership by the time they were told.
  //
  // Measured on production over all 48 profiles, in rolled-back transactions:
  // 21 accounts cannot be deleted at all, and under the old order 13 of those 21
  // lost rows anyway — Sarah Chen 2 `resident_links`, Sofia Nguyen 2 links and
  // 2 pets, Noah Kim 1 link and 2 pets, and ten more residents 1 link each — and
  // were then answered 400. Running `pets` first and stopping at the first
  // failure takes that from 13 to 3, and changes the deletable set NOT AT ALL:
  // 27 deletable / 21 blocked before and after. `pets` is the right one to lead
  // with because it is the one that actually fails (`violations_pet_id_fkey`),
  // and because deleting it is what cascades `care_entries` out of the way of
  // `care_entries_logged_by_fkey` — dropping these deletes entirely and trusting
  // `profiles_id_fkey` to cascade, which looks equivalent, measures WORSE: 24
  // blocked instead of 21.
  //
  // WHERE THE 21 ACTUALLY FAIL, under the order above, re-measured over all 48
  // profiles in a rolled-back transaction. The earlier version of this comment
  // printed the histogram of a DIFFERENT sequence and said "the residual 3 fail
  // at `deleteUser` itself", which reads as "3 accounts reach `deleteUser`". Six
  // do; 3 of those 6 are the ones that had rows to lose:
  //
  //     pets           violations_pet_id_fkey            10   0 rows lost
  //     businesses     service_bookings_business_id_fkey  5   0 rows lost
  //     deleteUser     incident_reports_reporter_id_fkey  2   3 pets, 3 links
  //     deleteUser     resident_links_decided_by_fkey     2   0 rows lost
  //     deleteUser     building_managers_granted_by_fkey  1   0 rows lost
  //     deleteUser     payments_profile_id_fkey           1   2 pets, 1 link
  //                                                      ---
  //                                                       21   3 accounts lose rows
  //
  // Three of the six reach `deleteUser` having deleted nothing, because they
  // owned no pet, no business and no resident_link — refused at no cost. The
  // other 3 are the whole residual: they lose 5 pets and 4 links between them
  // and are then answered 400. That is irreducible without one transaction
  // around the whole operation, which is the foreign-key redesign this phase is
  // deliberately not attempting.
  //
  // The histogram that stood here — `violations_resident_id_fkey 9`,
  // `incident_reports_reporter_id_fkey 3`, and no `violations_pet_id_fkey` row
  // at all — is the one for deleting `auth.users` with NO explicit deletes in
  // front of it. Measured, that sequence is `violations_resident_id 9`,
  // `service_bookings_business 5`, `care_entries_logged_by 3`,
  // `incident_reports_reporter 3`, `resident_links_decided_by 2`, `payments 1`,
  // `building_managers_granted_by 1` = 24 blocked, which is where the "24
  // instead of 21" above comes from. It is a real measurement of a sequence this
  // route does not perform, and it was printed as though it described this one.
  // Written out rather than looped: the three tables name the caller through
  // three different columns, and a loop over them collapses the column type to
  // the intersection of the three row types, which is not a column at all.
  const petsDelete = await admin.from("pets").delete().eq("owner_id", uid)
  if (petsDelete.error) return refuse("pets", petsDelete.error.message)

  const businessesDelete = await admin.from("businesses").delete().eq("owner_id", uid)
  if (businessesDelete.error) return refuse("businesses", businessesDelete.error.message)

  const linksDelete = await admin.from("resident_links").delete().eq("profile_id", uid)
  if (linksDelete.error) return refuse("resident_links", linksDelete.error.message)

  const { error } = await admin.auth.admin.deleteUser(uid)
  if (error) return refuse("deleteUser", error.message)

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
