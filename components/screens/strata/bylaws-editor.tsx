"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { updateMyBuildingRules } from "@/lib/data/manager"
import { computeCompliance } from "@/lib/data/live"
import type { PetRules } from "@/lib/data/admin"
import type { PortfolioBuilding, PetComplianceInput } from "@/lib/data/portfolio"
import { Loader2, AlertTriangle } from "lucide-react"

export const RULE_TOGGLES: { key: keyof PetRules; label: string }[] = [
  { key: "requires_registry", label: "Requires pet registration" },
  { key: "require_rabies", label: "Rabies vaccination required" },
  { key: "require_core_vaccines", label: "Core vaccines required" },
  { key: "require_license", label: "Municipal license required" },
  { key: "require_insurance", label: "Liability insurance required" },
  { key: "require_spay_neuter", label: "Spay/neuter required" },
]

const isCompliant = (p: PetComplianceInput, rules: PetRules) =>
  computeCompliance({ neutered: p.neutered, vax: p.vax, docs: p.docs }, rules).pct === 100

/** Count how many currently-compliant pets a proposed rule set would break. */
export function impactOf(pets: PetComplianceInput[], current: PetRules, proposed: PetRules) {
  let breaks = 0
  let heals = 0
  for (const p of pets) {
    const was = isCompliant(p, current)
    const now = isCompliant(p, proposed)
    if (was && !now) breaks++
    if (!was && now) heals++
  }
  return { breaks, heals, total: pets.length }
}

export function BuildingBylawsEditor({
  building,
  pets,
  onSaved,
}: {
  building: PortfolioBuilding
  pets: PetComplianceInput[]
  onSaved?: () => void
}) {
  const [rules, setRules] = useState<PetRules>(building.rules ?? {})
  const [saving, setSaving] = useState(false)

  const dirty = JSON.stringify(rules) !== JSON.stringify(building.rules ?? {})
  const impact = useMemo(() => impactOf(pets, building.rules ?? {}, rules), [pets, building.rules, rules])

  async function save() {
    setSaving(true)
    const { error } = await updateMyBuildingRules(building.id, rules)
    setSaving(false)
    if (error) return toast.error("Couldn't save bylaws", { description: error })
    toast.success(`Bylaws updated for ${building.name}`)
    onSaved?.()
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {RULE_TOGGLES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRules((p) => ({ ...p, [r.key]: !p[r.key] }))}
            className="flex w-full items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-left"
          >
            <span className="text-[13px] text-foreground">{r.label}</span>
            <span
              className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${rules[r.key] ? "bg-info" : "bg-border"}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${rules[r.key] ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </span>
          </button>
        ))}
      </div>

      {/* Impact preview — the whole point of bulk bylaw edits */}
      {dirty && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${
            impact.breaks > 0
              ? "border-warning/40 bg-warning/10 text-foreground"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {impact.breaks > 0 && <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />}
          <span>
            {impact.breaks > 0 ? (
              <>
                Saving makes <strong className="text-foreground">{impact.breaks}</strong> currently-compliant pet
                {impact.breaks === 1 ? "" : "s"} non-compliant
                {impact.heals > 0 ? `, and brings ${impact.heals} into compliance` : ""}.
              </>
            ) : impact.heals > 0 ? (
              <>Saving brings {impact.heals} pet{impact.heals === 1 ? "" : "s"} into compliance. No pets are broken.</>
            ) : (
              <>No pet&apos;s compliance changes under these rules.</>
            )}
          </span>
        </div>
      )}

      <button
        onClick={save}
        disabled={saving || !dirty}
        className="flex items-center justify-center gap-2 rounded-xl bg-info px-4 py-2 text-[13px] font-semibold text-info-foreground transition-colors disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {dirty ? "Save bylaws" : "Saved"}
      </button>
    </div>
  )
}
