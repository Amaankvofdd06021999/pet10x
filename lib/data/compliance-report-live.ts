"use client"

/**
 * Pet10x — the rows behind one building's Compliance Report. Every read names
 * the building; RLS (`manages_building`) is the floor under it.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { BuildingRules } from "./compliance"
import { buildComplianceReport, type ComplianceReport, type ReportPet } from "./compliance-report"

export function useComplianceReport(buildingId: string | undefined, rules: BuildingRules | undefined) {
  const [data, setData] = useState<ComplianceReport | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const rulesKey = JSON.stringify(rules ?? {})

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !buildingId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [petsRes, casesRes] = await Promise.all([
      supabase
        .from("pets")
        .select(
          `id, name, species, breed, neutered, registration_status,
           unit:units ( unit_number ),
           pet_vaccinations ( name, status, expires_on ),
           pet_documents ( kind, status, expires_on )`,
        )
        .eq("building_id", buildingId)
        .is("deleted_at", null)
        .order("name"),
      supabase.from("violations").select("stage").eq("building_id", buildingId).not("stage", "in", "(resolved,dismissed)"),
    ])
    if (petsRes.error || casesRes.error) {
      console.error("[compliance-report] load failed", petsRes.error ?? casesRes.error)
      setError("Couldn't load the compliance report. Try again.")
      setData(null)
      setLoading(false)
      return
    }

    type Row = {
      id: string
      name: string
      species: string
      breed: string | null
      neutered: boolean | null
      registration_status: string
      unit: { unit_number: string } | { unit_number: string }[] | null
      pet_vaccinations: { name: string; status: string; expires_on: string | null }[] | null
      pet_documents: { kind: string; status: string; expires_on: string | null }[] | null
    }
    const pets: ReportPet[] = ((petsRes.data ?? []) as unknown as Row[]).map((r) => {
      const unit = Array.isArray(r.unit) ? r.unit[0] : r.unit
      return {
        id: r.id,
        name: r.name,
        species: r.species,
        breed: r.breed,
        unit: unit?.unit_number ?? null,
        registrationStatus: r.registration_status,
        neutered: r.neutered,
        vax: (r.pet_vaccinations ?? []).map((v) => ({ name: v.name, status: v.status, expiresOn: v.expires_on })),
        docs: (r.pet_documents ?? []).map((d) => ({ kind: d.kind, status: d.status, expiresOn: d.expires_on })),
      }
    })
    setData(
      buildComplianceReport({
        pets,
        rules: JSON.parse(rulesKey) as BuildingRules,
        openCaseStages: (casesRes.data ?? []).map((c) => c.stage as string),
        // The manager's own calendar day: "expires in 30 days" is read by them.
        today: new Date().toLocaleDateString("en-CA"),
      }),
    )
    setError(null)
    setLoading(false)
  }, [buildingId, rulesKey])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}
