import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Whether Supabase env is configured. Until it is, the app keeps running on the
 * mock data layer (`@/lib/data`). The data hooks check this to decide source.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

let browserClient: SupabaseClient<Database> | null = null

/** Singleton browser client. Returns null when Supabase isn't configured yet. */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string)
  }
  return browserClient
}
