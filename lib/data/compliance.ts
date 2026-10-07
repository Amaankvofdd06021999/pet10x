/**
 * Pet10x — the compliance calculation, on its own.
 *
 * Lived in ./live.ts beside the hooks that call it; moved here (Part F) so a
 * pure module — the building compliance report — can import it under vitest
 * without pulling in the Supabase client. ./live.ts re-exports both names.
 */

export interface BuildingRules {
  require_rabies?: boolean
  require_core_vaccines?: boolean
  require_license?: boolean
  require_insurance?: boolean
  require_spay_neuter?: boolean
}

/**
 * Canonical compliance calculation — the single source of truth reused by the
 * manager dashboard, the strata portfolio overview, and the bylaws impact
 * preview. A vaccination counts unless its status is expired/missing/rejected;
 * license/insurance are matched by document kind; spay_neuter by the flag.
 */
export function computeCompliance(
  pet: { neutered: boolean | null; vax: { name: string; status: string }[]; docs: { kind: string }[] },
  rules: BuildingRules,
): { pct: number; missing: string[] } {
  const checks: { ok: boolean; label: string }[] = []
  const badVax = ["expired", "missing", "rejected"]
  if (rules.require_rabies)
    checks.push({ ok: pet.vax.some((v) => /rabies/i.test(v.name) && !badVax.includes(v.status)), label: "Rabies" })
  if (rules.require_core_vaccines)
    checks.push({ ok: pet.vax.some((v) => !badVax.includes(v.status)), label: "Core vaccines" })
  if (rules.require_license) checks.push({ ok: pet.docs.some((d) => d.kind === "municipal_license"), label: "License" })
  if (rules.require_insurance) checks.push({ ok: pet.docs.some((d) => d.kind === "liability_insurance"), label: "Insurance" })
  if (rules.require_spay_neuter) checks.push({ ok: !!pet.neutered, label: "Spay/neuter" })
  if (checks.length === 0) return { pct: 100, missing: [] }
  const met = checks.filter((c) => c.ok).length
  return { pct: Math.round((met / checks.length) * 100), missing: checks.filter((c) => !c.ok).map((c) => c.label) }
}
