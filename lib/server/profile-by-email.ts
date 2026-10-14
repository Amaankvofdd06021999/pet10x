import type { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * The account behind an email, if any. profiles has one row per auth user
 * (made by the auth trigger), so this is an indexed read rather than paging
 * auth.admin.listUsers. Pass the service-role client; `email` must already be
 * trimmed and lower-cased.
 */
export async function findProfileByEmail(admin: ReturnType<typeof getSupabaseAdmin>, email: string) {
  const { data } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle()
  return data
}
