"use client"

import { useMemo } from "react"
import { toast } from "sonner"
import { useBuildingPets, useViolations, useResolvedViolations } from "@/lib/data"
import { useOutstandingFines, toCsv, downloadCsv } from "@/lib/data/portfolio"
import { useStrata } from "./portal-context"
import { SectionCard, Spinner, StatTile } from "./strata-ui"
import { Download, FileSpreadsheet } from "lucide-react"

interface Metric {
  id: string
  name: string
  code: string
  compliance: number
  pets: number
  nonCompliant: number
  openViolations: number
  resolvedViolations: number
  finesOutstanding: number
}

export function ReportsScreen() {
  const { buildings } = useStrata()
  const { data: pets, isLoading } = useBuildingPets()
  const { data: openV } = useViolations()
  const { data: resolvedV } = useResolvedViolations()
  const { data: fines } = useOutstandingFines()

  const metrics = useMemo<Metric[]>(() => {
    return buildings.map((b) => {
      const bp = pets.filter((p) => p.buildingId === b.id)
      const compliance = bp.length ? Math.round(bp.reduce((s, p) => s + p.compliancePct, 0) / bp.length) : 100
      return {
        id: b.id,
        name: b.name,
        code: b.code,
        compliance,
        pets: bp.length,
        nonCompliant: bp.filter((p) => p.compliancePct < 100).length,
        openViolations: openV.filter((v) => v.buildingId === b.id).length,
        resolvedViolations: resolvedV.filter((v) => v.buildingId === b.id).length,
        finesOutstanding: fines.filter((f) => f.buildingId === b.id).reduce((s, f) => s + f.amount, 0),
      }
    })
  }, [buildings, pets, openV, resolvedV, fines])

  const median = useMemo(() => {
    const withPets = metrics.filter((m) => m.pets > 0).map((m) => m.compliance).sort((a, b) => a - b)
    if (!withPets.length) return 100
    const mid = Math.floor(withPets.length / 2)
    return withPets.length % 2 ? withPets[mid] : Math.round((withPets[mid - 1] + withPets[mid]) / 2)
  }, [metrics])

  function exportPortfolio() {
    const rows = metrics.map((m) => ({
      building: m.name,
      code: m.code,
      compliance_pct: m.compliance,
      benchmark_vs_median: m.compliance - median,
      pets: m.pets,
      non_compliant: m.nonCompliant,
      open_violations: m.openViolations,
      resolved_violations: m.resolvedViolations,
      fines_outstanding: m.finesOutstanding.toFixed(2),
    }))
    downloadCsv(
      "portfolio-summary.csv",
      toCsv(rows, [
        { key: "building", label: "Building" },
        { key: "code", label: "Code" },
        { key: "compliance_pct", label: "Compliance %" },
        { key: "benchmark_vs_median", label: "vs Median (pts)" },
        { key: "pets", label: "Pets" },
        { key: "non_compliant", label: "Non-compliant" },
        { key: "open_violations", label: "Open violations" },
        { key: "resolved_violations", label: "Resolved violations" },
        { key: "fines_outstanding", label: "Fines outstanding ($)" },
      ]),
    )
    toast.success("Portfolio summary exported")
  }

  function exportBoardPack(m: Metric) {
    const census = pets
      .filter((p) => p.buildingId === m.id)
      .map((p) => ({
        pet: p.name,
        species: p.species,
        breed: p.breed || "—",
        compliance_pct: p.compliancePct,
        missing: p.missing.join("; ") || "—",
      }))
    const csv = toCsv(census, [
      { key: "pet", label: "Pet" },
      { key: "species", label: "Species" },
      { key: "breed", label: "Breed" },
      { key: "compliance_pct", label: "Compliance %" },
      { key: "missing", label: "Missing requirements" },
    ])
    const header = `Board pack — ${m.name} (${m.code})\nCompliance,${m.compliance}% (portfolio median ${median}%)\nPets,${m.pets}\nOpen violations,${m.openViolations}\nFines outstanding,$${m.finesOutstanding.toFixed(2)}\n\n`
    downloadCsv(`board-pack-${m.code}.csv`, header + csv)
    toast.success(`Board pack for ${m.name} exported`)
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Portfolio median" value={`${median}%`} sub="benchmark line" tone="info" />
        <StatTile label="Buildings" value={buildings.length} />
        <StatTile
          label="Total fines outstanding"
          value={`$${metrics.reduce((s, m) => s + m.finesOutstanding, 0).toFixed(0)}`}
          tone="destructive"
        />
      </div>

      <SectionCard
        title="Portfolio summary"
        action={
          <button
            onClick={exportPortfolio}
            className="flex items-center gap-1.5 rounded-lg bg-info px-3 py-1.5 text-[12px] font-semibold text-info-foreground"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Building</th>
                <th className="py-2 pr-3 text-right font-semibold">Compliance</th>
                <th className="py-2 pr-3 text-right font-semibold">vs median</th>
                <th className="py-2 pr-3 text-right font-semibold">Open viol.</th>
                <th className="py-2 text-right font-semibold">Fines</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const delta = m.compliance - median
                return (
                  <tr key={m.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{m.name}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{m.compliance}%</td>
                    <td
                      className={`py-2 pr-3 text-right tabular-nums ${delta < 0 ? "text-destructive" : "text-success"}`}
                    >
                      {delta > 0 ? "+" : ""}
                      {delta}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{m.openViolations}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      ${m.finesOutstanding.toFixed(0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Board packs (per building)">
        <div className="space-y-2">
          {metrics.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-info/10">
                <FileSpreadsheet className="h-4.5 w-4.5 text-info" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-foreground">{m.name}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {m.compliance}% compliant · {m.pets} pets · {m.openViolations} open · ${m.finesOutstanding.toFixed(0)} owed
                </p>
              </div>
              <button
                onClick={() => exportBoardPack(m)}
                className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[12px] font-semibold text-foreground"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
