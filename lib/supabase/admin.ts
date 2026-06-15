import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

/**
 * Service-role admin client — SERVER ONLY. Bypasses RLS and has full DB access.
 * Never import this into client components. Used by API routes / Edge logic for
 * privileged work (invites via generateLink, role elevation, webhooks).
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error("Supabase admin client is not configured (missing URL or SUPABASE_SERVICE_ROLE_KEY).")
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
