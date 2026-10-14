import type { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * The account behind an email, if any. profiles has one row per auth user
 * (made by the auth trigger from auth.users.email), so this is an indexed read
 * rather than paging auth.admin.listUsers. GoTrue stores emails lower-cased,
 * and PostgREST can't express lower(email) equality without ilike wildcards,
 * so callers pass the trimmed, lower-cased address and we match it exactly.
 * A database error is returned, not swallowed: "no account" and "couldn't
 * check" must not look the same, or the caller would try to invite an
 * address that already has an account.
 */
export async function findProfileByEmail(admin: ReturnType<typeof getSupabaseAdmin>, email: string) {
  const { data, error } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle()
  return { profile: data, error }
}
