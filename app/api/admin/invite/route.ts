import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { sendManagerAddedEmail, sendManagerInviteEmail } from "@/lib/email"
import { checkInviteEmail, inviteFailureMessage, roleForNewManager } from "@/lib/data/admin-invite"
import { findProfileByEmail } from "@/lib/server/profile-by-email"

type InviteRole = "building_manager" | "business" | "super_admin"

/**
 * Invite a building manager (or business / admin). Super-admin only.
 * Generates a Supabase invite link with the admin SDK (no Supabase email),
 * elevates the new user's role, optionally links them to a building, then sends
 * a branded invite via Resend.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  // caller must be a super admin
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: me } = await supabase
    .from("profiles")
    .select("role, is_super_admin, full_name")
    .eq("id", user.id)
    .single()
  if (!me || (!me.is_super_admin && me.role !== "super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    fullName?: string
    role?: InviteRole
    buildingId?: string
    buildingName?: string
  }
  const checked = checkInviteEmail(body.email ?? "")
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
  const email = checked.email

  const role: InviteRole = body.role ?? "building_manager"
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin
  const admin = getSupabaseAdmin()

  // An email that already has an account can't be invited again. For a
  // building manager that's the normal way to add someone to a second building,
  // so link them instead. The link insert is idempotent, which also makes a
  // retry after a partial failure succeed.
  const { profile: existing, error: lookupErr } = await findProfileByEmail(admin, email)
  if (lookupErr) return NextResponse.json({ error: inviteFailureMessage(email) }, { status: 500 })
  if (existing) {
    if (role !== "building_manager" || !body.buildingId) {
      return NextResponse.json({ error: `${email} already has a Pet10x account. Only residents and managers can be added to a building.` }, { status: 409 })
    }
    const newRole = roleForNewManager(existing.role)
    if (newRole) {
      const { error: roleErr } = await admin.from("profiles").update({ role: newRole }).eq("id", existing.id)
      if (roleErr) return NextResponse.json({ error: inviteFailureMessage(email) }, { status: 500 })
    }
    const { error: linkErr } = await admin
      .from("building_managers")
      .upsert(
        { building_id: body.buildingId, profile_id: existing.id, granted_by: user.id },
        { onConflict: "building_id,profile_id", ignoreDuplicates: true },
      )
    if (linkErr) return NextResponse.json({ error: inviteFailureMessage(email) }, { status: 500 })

    // Email content comes from the database, not the request body.
    const { data: bldg } = await admin.from("buildings").select("name").eq("id", body.buildingId).maybeSingle()
    const notified = await sendManagerAddedEmail({ to: email, buildingName: bldg?.name?.trim() || "your building" })
    return NextResponse.json({ ok: true, existingAccount: true, emailSent: notified.ok })
  }

  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: `${origin}/auth/set-password`,
      data: { full_name: body.fullName, invited_role: role },
    },
  })
  if (error || !link?.properties?.action_link) {
    return NextResponse.json({ error: inviteFailureMessage(email) }, { status: 400 })
  }

  // Elevate the freshly-created profile (the auth trigger created it as
  // pet_owner). A failure here leaves an invited user with the wrong role or
  // no building link, so surface it rather than reporting success.
  const invitedId = link.user?.id
  if (invitedId) {
    const { error: roleErr } = await admin
      .from("profiles")
      .update({ role, full_name: body.fullName ?? null })
      .eq("id", invitedId)
    if (roleErr) {
      return NextResponse.json({ error: inviteFailureMessage(email) }, { status: 500 })
    }

    if (role === "building_manager" && body.buildingId) {
      const { error: linkErr } = await admin
        .from("building_managers")
        .upsert(
          { building_id: body.buildingId, profile_id: invitedId, granted_by: user.id },
          { onConflict: "building_id,profile_id", ignoreDuplicates: true },
        )
      if (linkErr) {
        return NextResponse.json(
          { error: inviteFailureMessage(email) },
          { status: 500 },
        )
      }
    }
  }

  const sent = await sendManagerInviteEmail({
    to: email,
    inviteUrl: link.properties.action_link,
    buildingName: body.buildingName,
    inviterName: me.full_name ?? "A Pet10x admin",
  })

  // Suppressed (dev) or refused by Resend: either way nobody got the link,
  // so hand it back for the inviter to pass on. `emailFailed` tells the UI
  // which of the two to say.
  return NextResponse.json({
    ok: true,
    emailSent: sent.ok,
    ...(sent.ok
      ? {}
      : { inviteUrl: link.properties.action_link, ...("error" in sent ? { emailFailed: true } : {}) }),
  })
}
