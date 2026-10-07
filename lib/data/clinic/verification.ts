"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { businessTierError } from "@/lib/data/business-tier"
import { useLive, must, type LiveResult } from "./use-live"

export interface VerificationRequest {
  id: string
  status: string
  note: string | null
  createdAt: string
}

/**
 * The practice's most recent licence verification request, or null. Staff read
 * their own business's rows (bver_select); this names the business and kind so
 * the query, not RLS, is the filter.
 */
export function useLatestVerification(businessId: string | null): LiveResult<VerificationRequest | null> {
  return useLive<VerificationRequest | null>(
    null,
    async (db) => {
      const rows = must(
        await db
          .from("business_verifications")
          .select("id, status, note, created_at")
          .eq("business_id", businessId as string)
          .eq("kind", "licence")
          .order("created_at", { ascending: false })
          .limit(1),
      ) as Array<{ id: string; status: string; note: string | null; created_at: string }>
      const r = rows[0]
      return r ? { id: r.id, status: r.status, note: r.note, createdAt: r.created_at } : null
    },
    [businessId],
    Boolean(businessId),
  )
}

/**
 * Ask Pet10x to verify the practice. Inserts a `submitted` licence request;
 * bver_insert admits the practice's owner or managers only, and the database
 * allows one open request per kind (20261009000002). An admin approves it
 * (tier → verified) or rejects it with a note from the admin console.
 */
export async function requestVerification(businessId: string): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Supabase is not configured." }
  const { error } = await db
    .from("business_verifications")
    .insert({ business_id: businessId, kind: "licence", status: "submitted" })
  return { error: error ? businessTierError(error) : null }
}
