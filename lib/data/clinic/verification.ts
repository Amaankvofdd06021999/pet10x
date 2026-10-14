"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { businessTierError } from "@/lib/data/business-tier"
import type { VerificationInput } from "@/lib/data/verification-form"
import { useLive, must, type LiveResult } from "./use-live"

export interface VerificationRequest {
  id: string
  status: string
  note: string | null
  createdAt: string
  /** What was sent, so asking again starts from it. */
  licenceNumber: string | null
  issuingBody: string | null
  contactName: string | null
  contactPhone: string | null
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
          .select("id, status, note, created_at, licence_number, issuing_body, contact_name, contact_phone")
          .eq("business_id", businessId as string)
          .eq("kind", "licence")
          .order("created_at", { ascending: false })
          .limit(1),
      ) as Array<{
        id: string
        status: string
        note: string | null
        created_at: string
        licence_number: string | null
        issuing_body: string | null
        contact_name: string | null
        contact_phone: string | null
      }>
      const r = rows[0]
      return r
        ? {
            id: r.id,
            status: r.status,
            note: r.note,
            createdAt: r.created_at,
            licenceNumber: r.licence_number,
            issuingBody: r.issuing_body,
            contactName: r.contact_name,
            contactPhone: r.contact_phone,
          }
        : null
    },
    [businessId],
    Boolean(businessId),
  )
}

/**
 * Ask Pet10x to verify the practice. Inserts a `submitted` licence request with
 * the details the admin approves on (validated by validateVerification);
 * bver_insert admits the practice's owner or managers only, and the database
 * allows one open request per kind (20261009000002). An admin approves it
 * (tier -> verified), rejects it with a note, or asks for more information.
 * There is no document upload: no storage bucket admits one yet, so
 * document_path stays null.
 */
export async function requestVerification(
  businessId: string,
  details: VerificationInput,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Supabase is not configured." }
  const { error } = await db.from("business_verifications").insert({
    business_id: businessId,
    kind: "licence",
    status: "submitted",
    licence_number: details.licenceNumber,
    issuing_body: details.issuingBody,
    contact_name: details.contactName || null,
    contact_phone: details.contactPhone || null,
  })
  return { error: error ? businessTierError(error) : null }
}
