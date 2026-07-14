"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * Emergency directory — the token-gated, read-only slice a first responder sees.
 *
 * Responders are anonymous, so RLS blocks them from reading pets or tokens
 * directly. Everything goes through the `emergency_directory` RPC, which
 * validates the token server-side (exists, not revoked, not expired), logs the
 * access, and returns only the fields the PRD permits — never owner identity,
 * medical history, or billing.
 */

export interface EmergencyPet {
  name: string
  species: string
  /** Pet is currently in the building, per its own status. */
  present: boolean
  status: string
  notes: string | null
  emergency: string | null
}

export interface EmergencyUnit {
  unit: string
  pets: EmergencyPet[]
}

export interface EmergencyFloor {
  floor: number
  units: EmergencyUnit[]
}

export interface EmergencyDirectory {
  valid: true
  expiresAt: string
  building: { name: string; address: string | null }
  totals: { total: number; dogs: number; cats: number; other: number }
  floors: EmergencyFloor[]
}

export type EmergencyResult = EmergencyDirectory | { valid: false }

interface RawDirectory {
  valid: boolean
  expires_at?: string
  building?: { name: string; address: string | null }
  totals?: { total: number; dogs: number; cats: number; other: number }
  floors?: EmergencyFloor[]
}

/** True when the pet's notes flag it as a handling risk (PRD §6.8: caution flag). */
export function isCaution(notes: string | null): boolean {
  if (!notes) return false
  return /aggress|caution|bite|reactive|muzzle|nervous/i.test(notes)
}

/**
 * Fetch the directory for a token. Returns `{ valid: false }` for a token that
 * is unknown, expired, or revoked — the caller renders the same dead end for
 * all three, so a bad token reveals nothing about why.
 */
export async function fetchEmergencyDirectory(token: string): Promise<EmergencyResult> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { valid: false }

  const { data, error } = await supabase.rpc("emergency_directory", { p_token: token })
  if (error || !data) return { valid: false }

  const raw = data as unknown as RawDirectory
  if (!raw.valid || !raw.expires_at || !raw.building) return { valid: false }

  return {
    valid: true,
    expiresAt: raw.expires_at,
    building: raw.building,
    totals: raw.totals ?? { total: 0, dogs: 0, cats: 0, other: 0 },
    floors: raw.floors ?? [],
  }
}
