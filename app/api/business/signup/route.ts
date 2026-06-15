import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Business self-signup. Public endpoint — creates a confirmed auth user, elevates
 * the profile to `business` (self-elevation is blocked by guard_profile_privilege,
 * so this runs with the service role), and creates a pending (unverified) business.
 * The business stays hidden from the consumer directory until a super-admin verifies.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    password?: string
    businessName?: string
    category?: string
    fullName?: string
  }
  if (!body.email || !body.password || !body.businessName) {
    return NextResponse.json({ error: "Email, password and business name are required." }, { status: 400 })
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: created, error: cerr } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.fullName },
  })
  if (cerr || !created.user) {
    const msg = /already|registered|exists/i.test(cerr?.message ?? "")
      ? "An account with this email already exists."
      : (cerr?.message ?? "Could not create the account.")
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const uid = created.user.id
  await admin.from("profiles").update({ role: "business", full_name: body.fullName ?? null }).eq("id", uid)

  const { error: berr } = await admin.from("businesses").insert({
    owner_id: uid,
    name: body.businessName,
    category: body.category || "Pet services",
    is_verified: false,
  })
  if (berr) {
    // roll back the orphaned auth user so the email can be reused
    await admin.auth.admin.deleteUser(uid).catch(() => {})
    return NextResponse.json({ error: berr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
