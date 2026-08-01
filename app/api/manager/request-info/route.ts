import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { sendRequestInfoEmail } from "@/lib/email"

/**
 * Ask a resident for the details their registration is missing.
 *
 * The manager's half of the completeness loop. Sets the link to
 * `info_requested` — a status the schema has always had and nothing used —
 * then tells the resident in the app AND by email. Email matters here more
 * than anywhere else in the product: the residents who have filled nothing in
 * are, by definition, the ones not opening the app.
 *
 * The manager cannot pick what to ask for. The list is derived from the same
 * rules the resident's own card reads, so the two can never disagree, and a
 * manager cannot demand something their building does not require.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { linkId?: string; missing?: string[] }
  if (!body.linkId) return NextResponse.json({ error: "linkId is required" }, { status: 400 })

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service role not configured" }, { status: 503 })

  // The link, its building, and the resident behind it.
  const { data: link } = await admin
    .from("resident_links")
    .select("id, profile_id, building_id, status")
    .eq("id", body.linkId)
    .maybeSingle()

  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 })

  // Caller must actually manage this building. Checked against
  // building_managers rather than trusting the role on the profile, so a
  // manager of one building cannot chase a resident of another.
  const { data: manages } = await admin
    .from("building_managers")
    .select("profile_id")
    .eq("building_id", link.building_id)
    .eq("profile_id", user.id)
    .maybeSingle()

  const { data: me } = await admin
    .from("profiles")
    .select("full_name, is_super_admin, is_suspended")
    .eq("id", user.id)
    .maybeSingle()

  if (me?.is_suspended) return NextResponse.json({ error: "Account suspended" }, { status: 403 })
  if (!manages && !me?.is_super_admin) {
    return NextResponse.json({ error: "You don't manage this building" }, { status: 403 })
  }

  const [{ data: resident }, { data: building }] = await Promise.all([
    admin.from("profiles").select("full_name, email").eq("id", link.profile_id).maybeSingle(),
    admin.from("buildings").select("name").eq("id", link.building_id).maybeSingle(),
  ])

  const missing = (body.missing ?? []).filter(Boolean)
  const list = missing.length > 0 ? missing.join(", ") : "a few registration details"
  const buildingName = building?.name ?? "your building"

  // Stamped first: if the notification or the email then fails, the queue
  // still shows this resident has been asked, so nobody is chased twice.
  // `status` is untouched — the link is still pending the same decision, and
  // moving it out of `pending` would hide it from the resident's own screen.
  await admin
    .from("resident_links")
    .update({ info_requested_at: new Date().toISOString(), info_requested_by: user.id })
    .eq("id", link.id)

  await admin.from("notifications").insert({
    profile_id: link.profile_id,
    kind: "building",
    severity: "warning",
    title: `${buildingName} needs a few details`,
    body: `Still needed: ${list}. Open your profile to add them.`,
    action_label: "Complete registration",
    action_target: "profile",
    building_id: link.building_id,
  })

  // Best effort. A missing RESEND_API_KEY must not fail the request — the
  // in-app notification has already landed and is the guaranteed channel.
  let emailed = false
  if (resident?.email) {
    const res = await sendRequestInfoEmail({
      to: resident.email,
      name: resident.full_name ?? undefined,
      buildingName,
      missing,
    })
    // send() returns { suppressed: true } when RESEND_API_KEY is absent, and
    // a Resend result otherwise — neither shape guarantees an `error` key.
    emailed = !("suppressed" in res) && !("error" in res && res.error)
  }

  return NextResponse.json({ ok: true, requested: true, emailed, missing })
}
