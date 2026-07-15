import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { sendManagerInviteEmail } from "@/lib/email"

/**
 * Manager-scoped delegation invite. Unlike /api/admin/invite (super-admin only),
 * the caller here must be a PRIMARY manager of the target building. Adds a
 * co-manager to that building — either an existing account or a fresh invite.
 * Requires SUPABASE_SERVICE_ROLE_KEY (same as the admin invite); degrades with a
 * clear message when that isn't configured.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    fullName?: string
    buildingId?: string
    buildingName?: string
  }
  if (!body.email) return NextResponse.json({ error: "email is required" }, { status: 400 })
  if (!body.buildingId) return NextResponse.json({ error: "buildingId is required" }, { status: 400 })

  // Caller must be a non-suspended PRIMARY manager of THIS building.
  const { data: me } = await supabase.from("profiles").select("full_name, is_suspended").eq("id", user.id).single()
  if (me?.is_suspended) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: membership } = await supabase
    .from("building_managers")
    .select("is_primary")
    .eq("building_id", body.buildingId)
    .eq("profile_id", user.id)
    .maybeSingle()
  if (!membership || !membership.is_primary) {
    return NextResponse.json({ error: "Only a primary manager of this building can invite co-managers." }, { status: 403 })
  }

  let admin: ReturnType<typeof getSupabaseAdmin>
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json(
      { error: "Invites need server configuration (SUPABASE_SERVICE_ROLE_KEY). Removal still works without it." },
      { status: 503 },
    )
  }

  const email = body.email.trim().toLowerCase()

  // Existing account → just elevate + link (no email round trip needed).
  const { data: existing } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle()
  if (existing) {
    const { data: dup } = await admin
      .from("building_managers")
      .select("id")
      .eq("building_id", body.buildingId)
      .eq("profile_id", existing.id)
      .maybeSingle()
    if (dup) return NextResponse.json({ error: "That person already manages this building." }, { status: 409 })

    if (existing.role !== "building_manager") {
      const { error: roleErr } = await admin.from("profiles").update({ role: "building_manager" }).eq("id", existing.id)
      if (roleErr) return NextResponse.json({ error: `Couldn't set manager role: ${roleErr.message}` }, { status: 500 })
    }
    const { error: linkErr } = await admin
      .from("building_managers")
      .insert({ building_id: body.buildingId, profile_id: existing.id, granted_by: user.id, is_primary: false })
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, emailSent: false })
  }

  // New user → generate an invite link, elevate, link, email.
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: `${origin}/auth/set-password`,
      data: { full_name: body.fullName, invited_role: "building_manager" },
    },
  })
  if (error || !link?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? "Failed to generate invite" }, { status: 400 })
  }

  const invitedId = link.user?.id
  if (invitedId) {
    const { error: roleErr } = await admin
      .from("profiles")
      .update({ role: "building_manager", full_name: body.fullName ?? null })
      .eq("id", invitedId)
    if (roleErr) return NextResponse.json({ error: `Invited, but role assignment failed: ${roleErr.message}` }, { status: 500 })

    const { error: linkErr } = await admin
      .from("building_managers")
      .insert({ building_id: body.buildingId, profile_id: invitedId, granted_by: user.id, is_primary: false })
    if (linkErr) {
      return NextResponse.json({ error: `Invited, but linking to the building failed: ${linkErr.message}` }, { status: 500 })
    }
  }

  const sent = await sendManagerInviteEmail({
    to: email,
    inviteUrl: link.properties.action_link,
    buildingName: body.buildingName,
    inviterName: me?.full_name ?? "A Pet10x strata manager",
  })
  const suppressed = "suppressed" in sent && sent.suppressed
  return NextResponse.json({
    ok: true,
    emailSent: !suppressed,
    ...(suppressed ? { inviteUrl: link.properties.action_link } : {}),
  })
}
