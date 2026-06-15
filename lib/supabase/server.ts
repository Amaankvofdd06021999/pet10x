import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from "./client"
import type { Database } from "./database.types"

/**
 * Server client for Server Components, Route Handlers, and Server Actions.
 * Returns null when Supabase isn't configured. Reads/writes the auth cookies so
 * sessions persist; cookie writes from a Server Component are caught (the
 * middleware refreshes the session instead).
 */
export async function getSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null
  const cookieStore = await cookies()

  return createServerClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component — safe to ignore; middleware handles refresh.
        }
      },
    },
  })
}
