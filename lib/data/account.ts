"use client"

/**
 * Pet10x — Account self-service: export-my-data + delete-account (PIPEDA / Apple).
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export async function exportMyData(): Promise<Record<string, unknown> | null> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
  const { data: pets } = await supabase
    .from("pets")
    .select("*, pet_vaccinations(*), pet_documents(*), pet_emergency_contacts(*)")
    .eq("owner_id", user.id)
  const petIds = (pets ?? []).map((p) => p.id)
  let careEntries: unknown[] = []
  if (petIds.length) {
    const { data: c } = await supabase.from("care_entries").select("*").in("pet_id", petIds)
    careEntries = c ?? []
  }
  const { data: links } = await supabase.from("resident_links").select("*").eq("profile_id", user.id)

  return {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile: profile ?? null,
    pets: pets ?? [],
    careEntries,
    buildingLinks: links ?? [],
  }
}

export async function deleteMyAccount(): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/account/delete", { method: "POST" })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !json.ok) return { error: json.error ?? "Couldn't delete your account." }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't delete your account." }
  }
}
