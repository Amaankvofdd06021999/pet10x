"use client"

/**
 * Pet10x — Account self-service: export-my-data + delete-account (PIPEDA / Apple).
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * WHAT THIS DOES NOT EXPORT, REPORTED RATHER THAN QUIETLY LEFT OUT.
 *
 * A resident's accommodation requests, their decision notes and their document
 * metadata are NOT here, and PIPEDA's right of access is the same statute
 * `/api/account/delete` was fixed for. `accom_select` and `accomdoc_select` both
 * admit `resident_id = auth.uid()` and return the whole row, so the data is
 * readable — adding two queries would produce output.
 *
 * It was left out of the Phase 7 fix round ON PURPOSE, because two queries is
 * not the hard part and shipping them blind would export the wrong thing:
 *
 *   * `legal_note` is manager-authored counsel. `accom_select` returns it to the
 *     resident, and the product deliberately never renders it to them — the
 *     seeded rows read "Seek legal advice before denying", and putting that in
 *     front of the applicant is not the product (docs/RBAC_CAPABILITIES.md,
 *     "legal_note is labelled as SHARED, not private"). A `select *` here would
 *     hand it to them in a download and undo that decision silently.
 *   * `review_note` is the opposite case and SHOULD go in: it is written to be
 *     resident-readable, and a rejected letter whose reason the resident cannot
 *     learn is a dead end.
 *   * The documents themselves are files, not rows. An export that lists an
 *     `esa_letter` it cannot hand over needs a decision about signed URLs and
 *     their lifetime, not a column list.
 *
 * So this is a scoped piece of work with a real choice in it, not an oversight.
 * Named here so the next person finds the choice rather than the gap.
 */
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

export async function updateMyProfile(patch: {
  fullName?: string
  avatarFile?: File
}): Promise<{ error: string | null; avatarUrl?: string }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in." }

  let avatarUrl: string | undefined
  if (patch.avatarFile) {
    const ext = patch.avatarFile.name.split(".").pop()?.toLowerCase() || "jpg"
    const path = `${user.id}/avatar-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, patch.avatarFile, { upsert: true, cacheControl: "3600" })
    if (upErr) return { error: upErr.message }
    avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl
  }

  const update: { full_name?: string; avatar_url?: string } = {}
  if (patch.fullName !== undefined) update.full_name = patch.fullName
  if (avatarUrl) update.avatar_url = avatarUrl

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("profiles").update(update).eq("id", user.id)
    if (error) return { error: error.message }
  }

  return { error: null, avatarUrl }
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

/**
 * Set the signed-in resident's unit.
 *
 * Goes through the `set_my_unit` RPC rather than writing `resident_links`
 * directly: residents have no UPDATE policy on that table, and widening it
 * enough to allow this would also let them change their building or approve
 * themselves. The function is scoped to unit_id on their own active link.
 */
export async function setMyUnit(unit: string): Promise<{ error: string | null; unit?: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }

  const { data, error } = await supabase.rpc("set_my_unit", { p_unit: unit })
  if (error) return { error: error.message }

  const r = (data ?? {}) as { ok?: boolean; error?: string; unit?: string | null }
  if (!r.ok) {
    return {
      error:
        r.error === "no_building"
          ? "Join a building first — a unit number only means something inside one."
          : "Couldn't save your unit.",
    }
  }
  return { error: null, unit: r.unit ?? null }
}

export interface MyAddress {
  streetAddress: string | null
  addressUnit: string | null
  city: string | null
  region: string | null
  postalCode: string | null
}

/** The signed-in person's own home address. */
export async function getMyAddress(): Promise<MyAddress | null> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("profiles")
    .select("street_address, address_unit, city, region, postal_code")
    .eq("id", user.id)
    .maybeSingle()
  if (!data) return null
  return {
    streetAddress: data.street_address,
    addressUnit: data.address_unit,
    city: data.city,
    region: data.region,
    postalCode: data.postal_code,
  }
}

export async function updateMyAddress(a: MyAddress): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not signed in." }

  const { error } = await supabase
    .from("profiles")
    .update({
      street_address: a.streetAddress?.trim() || null,
      address_unit: a.addressUnit?.trim() || null,
      city: a.city?.trim() || null,
      region: a.region?.trim() || null,
      postal_code: a.postalCode?.trim() || null,
    })
    .eq("id", user.id)
  return { error: error?.message ?? null }
}

/**
 * Buildings already on Pet10x whose address matches the caller's.
 *
 * Names only — the server function never returns an id or a code. A match is
 * the cue to say "your building uses Pet10x, ask them for a code", not a way
 * to join one.
 */
export async function buildingsMatchingMyAddress(): Promise<string[]> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase.rpc("buildings_matching_my_address")
  if (error || !data) return []
  return ((data as unknown as { matches?: string[] }).matches ?? []).filter(Boolean)
}
