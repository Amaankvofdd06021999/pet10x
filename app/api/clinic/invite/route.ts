import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { sendClinicInviteEmail } from "@/lib/email"
import { parseClinicInvite, STAFF_ROLE_LABEL } from "@/lib/data/clinic/staff-invite"

/**
 * A practice adds someone to its team. Cloned from /api/strata/invite.
 *
 * WHO MAY: whoever passes `can_admin_business` for the business — the owner,
 * or an active owner/manager staff row (20260901000008) — asked through the
 * CALLER'S OWN SESSION, never read from the body. The staff row itself is also
 * inserted under that session, so `bstaff_write` checks the same thing again;
 * the service-role client is used only for what a practice cannot do itself:
 * finding an account by email, and creating an invited account.
 *
 * Existing account: a staff row, no email (exactly as strata adds an existing
 * co-manager). New address: an invite link to /auth/set-password, the staff
 * row, and an email — and when email is suppressed (dev) the link comes back
 * as `inviteUrl` so the Team screen can offer to copy it.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = parseClinicInvite(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { businessId, email, fullName, role } = parsed.invite

  const { data: me } = await supabase.from("profiles").select("full_name, is_suspended").eq("id", user.id).single()
  if (me?.is_suspended) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: canAdmin, error: adminErr } = await supabase.rpc("can_admin_business", { p_business: businessId })
  if (adminErr) {
    console.error("[clinic/invite] can_admin_business", adminErr)
    return NextResponse.json({ error: "Couldn't check your access to this practice. Try again." }, { status: 500 })
  }
  if (!canAdmin) {
    return NextResponse.json(
      { error: "Only the practice owner or a practice manager can invite staff." },
      { status: 403 },
    )
  }

  // Read under the caller's session: `businesses_staff_read` admits staff.
  const { data: biz } = await supabase.from("businesses").select("name").eq("id", businessId).maybeSingle()
  const businessName = biz?.name ?? "your practice"

  let admin: ReturnType<typeof getSupabaseAdmin>
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json(
      { error: "Invites need server configuration (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 503 },
    )
  }

  /** Insert the staff row as the caller, refusing a duplicate in words. */
  async function addStaff(profileId: string): Promise<NextResponse | null> {
    const { data: dup } = await supabase!
      .from("business_staff")
      .select("id, is_active")
      .eq("business_id", businessId)
      .eq("profile_id", profileId)
      .maybeSingle()
    if (dup) {
      return NextResponse.json(
        {
          error: dup.is_active
            ? "That person is already on your team."
            : "That person is already on your team, but deactivated. Reactivate them from the list.",
        },
        { status: 409 },
      )
    }
    const { error } = await supabase!.from("business_staff").insert({
      business_id: businessId,
      profile_id: profileId,
      role,
      invited_by: user!.id,
      invited_at: new Date().toISOString(),
      is_active: true,
    })
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "That person is already on your team." }, { status: 409 })
      }
      console.error("[clinic/invite] business_staff insert", error)
      return NextResponse.json({ error: "Couldn't add them to the team. Try again." }, { status: 500 })
    }
    return null
  }

  // Existing account → a staff row; they see the practice next time they sign in.
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle()
  if (existing) {
    const refused = await addStaff(existing.id)
    if (refused) return refused
    return NextResponse.json({ ok: true, emailSent: false, existing: true })
  }

  // New address → invite link, staff row, email.
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: `${origin}/auth/set-password`,
      data: { full_name: fullName },
    },
  })
  if (error || !link?.properties?.action_link || !link.user?.id) {
    console.error("[clinic/invite] generateLink", error)
    return NextResponse.json(
      { error: "Couldn't create an invite for that address. Check it and try again." },
      { status: 400 },
    )
  }

  const invitedId = link.user.id
  const { error: nameErr } = await admin.from("profiles").update({ full_name: fullName }).eq("id", invitedId)
  if (nameErr) console.error("[clinic/invite] profile name", nameErr)

  const refused = await addStaff(invitedId)
  if (refused) return refused

  const sent = await sendClinicInviteEmail({
    to: email,
    inviteUrl: link.properties.action_link,
    businessName,
    inviterName: me?.full_name ?? "Your practice",
    roleLabel: STAFF_ROLE_LABEL[role],
  })
  const suppressed = "suppressed" in sent && sent.suppressed
  return NextResponse.json({
    ok: true,
    emailSent: !suppressed,
    ...(suppressed ? { inviteUrl: link.properties.action_link } : {}),
  })
}
