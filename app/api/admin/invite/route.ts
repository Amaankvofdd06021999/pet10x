import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { sendManagerInviteEmail } from "@/lib/email"

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
  if (!body.email) return NextResponse.json({ error: "email is required" }, { status: 400 })

  const role: InviteRole = body.role ?? "building_manager"
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin
  const admin = getSupabaseAdmin()

  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: body.email,
    options: {
      redirectTo: `${origin}/auth/set-password`,
      data: { full_name: body.fullName, invited_role: role },
    },
  })
  if (error || !link?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? "Failed to generate invite" }, { status: 400 })
  }

  // elevate the freshly-created profile (trigger created it as pet_owner)
  const invitedId = link.user?.id
  if (invitedId) {
    await admin.from("profiles").update({ role, full_name: body.fullName ?? null }).eq("id", invitedId)
    if (role === "building_manager" && body.buildingId) {
      await admin
        .from("building_managers")
        .insert({ building_id: body.buildingId, profile_id: invitedId, granted_by: user.id })
    }
  }

  await sendManagerInviteEmail({
    to: body.email,
    inviteUrl: link.properties.action_link,
    buildingName: body.buildingName,
    inviterName: me.full_name ?? "A Pet10x admin",
  })

  return NextResponse.json({ ok: true })
}
