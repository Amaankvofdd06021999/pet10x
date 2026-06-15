import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Delete the CALLER's own account and owned data (PIPEDA / Apple "delete account").
 * Explicitly removes owned rows (avoids FK restrict surprises), then the auth user.
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

  // owned data — pets cascade to care_entries / care_targets / vaccinations / documents / contacts
  await admin.from("businesses").delete().eq("owner_id", uid)
  await admin.from("resident_links").delete().eq("profile_id", uid)
  await admin.from("pets").delete().eq("owner_id", uid)

  const { error } = await admin.auth.admin.deleteUser(uid)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
