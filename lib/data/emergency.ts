"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { EmergencyCheck } from "@/lib/data/emergency-state"

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
 * Fetch the directory for a token. Only the server's own answer that the token
 * is unknown, expired or revoked (`valid: false`) is "denied" — the caller
 * renders the same dead end for all three, so a bad token reveals nothing about
 * why. Any transport or RPC failure is "network": the link may be perfectly
 * good, so the caller keeps what it has and offers a retry.
 */
export async function fetchEmergencyDirectory(token: string): Promise<EmergencyCheck<EmergencyDirectory>> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { kind: "network" }

  let res
  try {
    res = await supabase.rpc("emergency_directory", { p_token: token })
  } catch {
    return { kind: "network" }
  }
  if (res.error || !res.data) return { kind: "network" }

  const raw = res.data as unknown as RawDirectory
  if (raw.valid === false) return { kind: "denied" }
  // Positive grammar: data counts only when it says valid and carries the fields we render.
  if (raw.valid !== true || !raw.expires_at || !raw.building) return { kind: "network" }

  return {
    kind: "valid",
    data: {
      valid: true,
      expiresAt: raw.expires_at,
      building: raw.building,
      totals: raw.totals ?? { total: 0, dogs: 0, cats: 0, other: 0 },
      floors: raw.floors ?? [],
    },
  }
}
