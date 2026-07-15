"use client"

import { useMemo } from "react"
import { useBuildingPets, useViolations } from "@/lib/data"
import { useOutstandingFines } from "@/lib/data/portfolio"
import { useWorkQueue } from "@/lib/data/work-queue"
import { useStrata } from "./portal-context"
import {
  StatTile,
  SectionCard,
  LoadError,
  Spinner,
  buildingState,
  STATE_LABEL,
  STATE_TEXT,
  STATE_DOT,
} from "./strata-ui"
import { BarChart3, ChevronRight } from "lucide-react"

const TARGET = 90

interface BuildingRow {
  id: string
  name: string
  code: string
  pets: number
  compliance: number
  nonCompliant: number
}

export function PortfolioOverviewScreen({ onOpenTab }: { onOpenTab: (tab: "queue" | "buildings") => void }) {
  const { buildings, selectedBuildingId, inScope } = useStrata()
  const { data: pets, isLoading: petsLoading, error: petsError, refetch } = useBuildingPets()
  const { data: violations } = useViolations()
  const { data: fines } = useOutstandingFines()
  const { items: queue } = useWorkQueue()

  const rows = useMemo<BuildingRow[]>(() => {
    const acc = new Map<string, { name: string; code: string; pets: number; sum: number; non: number }>()
    for (const b of buildings) acc.set(b.id, { name: b.name, code: b.code, pets: 0, sum: 0, non: 0 })
    for (const p of pets) {
      if (!p.buildingId) continue
      const e = acc.get(p.buildingId)
      if (!e) continue
      e.pets++
      e.sum += p.compliancePct
      if (p.compliancePct < 100) e.non++
    }
    return [...acc.entries()]
      .filter(([id]) => inScope(id))
      .map(([id, e]) => ({
        id,
        name: e.name,
        code: e.code,
        pets: e.pets,
        compliance: e.pets ? Math.round(e.sum / e.pets) : 100,
        nonCompliant: e.non,
      }))
      .sort((a, b) => a.compliance - b.compliance)
  }, [buildings, pets, inScope])

  const withPets = rows.filter((r) => r.pets > 0)
  const portfolioCompliance = withPets.length
    ? Math.round(withPets.reduce((s, r) => s + r.compliance, 0) / withPets.length)
    : 100
  const worstId = withPets.length ? withPets[0].id : null

  const scopedQueue = queue.filter((q) => inScope(q.buildingId))
  const scopedPets = pets.filter((p) => inScope(p.buildingId))
  const openViolations = violations.filter((v) => inScope(v.buildingId)).length
  const scopedFines = fines.filter((f) => inScope(f.buildingId))
  const finesTotal = scopedFines.reduce((s, f) => s + f.amount, 0)

  if (petsLoading) return <Spinner />
  if (petsError) return <LoadError message={petsError} onRetry={refetch} />

  return (
    <div className="space-y-5">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Portfolio compliance"
          value={`${portfolioCompliance}%`}
          sub={selectedBuildingId === "all" ? `across ${withPets.length} building${withPets.length === 1 ? "" : "s"}` : "this building"}
          tone={portfolioCompliance < 75 ? "destructive" : portfolioCompliance < 90 ? "warning" : "success"}
        />
        <button onClick={() => onOpenTab("queue")} className="text-left">
          <StatTile label="Needs your action" value={scopedQueue.length} sub="open work items" tone="info" />
        </button>
        <StatTile label="Open violations" value={openViolations} sub="unresolved" tone={openViolations ? "warning" : "default"} />
        <StatTile label="Pets tracked" value={scopedPets.length} sub="registered + pending" />
        <StatTile
          label="Fines outstanding"
          value={`$${finesTotal.toLocaleString(undefined, { minimumFractionDigits: 0 })}`}
          sub={`${scopedFines.length} unpaid`}
          tone={finesTotal ? "destructive" : "default"}
        />
      </div>

      {/* Emphasis bar chart */}
      <SectionCard
        title="Compliance by building — worst first"
        action={
          <button
            onClick={() => onOpenTab("buildings")}
            className="flex items-center gap-1 text-[12px] font-semibold text-info transition-colors hover:opacity-80"
          >
            Open buildings <ChevronRight className="h-3.5 w-3.5" />
          </button>
        }
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">No buildings in scope.</p>
        ) : (
          <div className="space-y-2.5">
            {rows.map((r) => {
              const state = buildingState(r.compliance)
              const isWorst = r.id === worstId && r.compliance < TARGET
              return (
                <div key={r.id} className="grid grid-cols-[minmax(110px,150px)_1fr_84px] items-center gap-3 text-[13px]">
                  <span className="truncate text-muted-foreground" title={r.name}>
                    {r.name}
                  </span>
                  <div className="relative h-6 rounded bg-muted/50">
                    <div
                      className={`h-6 rounded ${isWorst ? "bg-info" : "bg-muted-foreground/35"}`}
                      style={{ width: `${Math.max(r.compliance, 2)}%` }}
                      title={`${r.name} — ${r.compliance}% compliant · ${r.nonCompliant} non-compliant`}
                    />
                    {/* 90% target line */}
                    <div
                      className="absolute -top-1 bottom-[-4px] w-0.5 bg-foreground/50"
                      style={{ left: `${TARGET}%` }}
                      title="Portfolio target: 90%"
                    />
                  </div>
                  <span className="text-right font-semibold tabular-nums text-foreground">
                    {r.compliance}%
                    <span className={`block text-[10.5px] font-medium ${STATE_TEXT[state]}`}>{STATE_LABEL[state]}</span>
                  </span>
                </div>
              )
            })}
            <div className="grid grid-cols-[minmax(110px,150px)_1fr_84px] gap-3 pt-1 text-[10.5px] text-muted-foreground">
              <span />
              <span>0% — target 90% — 100%</span>
              <span />
            </div>
          </div>
        )}
      </SectionCard>

      {/* Table */}
      <SectionCard title="Portfolio detail">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Building</th>
                <th className="py-2 pr-3 text-right font-semibold">Compliance</th>
                <th className="py-2 pr-3 text-right font-semibold">Pets</th>
                <th className="py-2 pr-3 text-right font-semibold">Non-compliant</th>
                <th className="py-2 text-right font-semibold">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const state = buildingState(r.compliance)
                return (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-foreground">{r.name}</span>
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{r.code}</span>
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums text-foreground">{r.compliance}%</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{r.pets}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{r.nonCompliant}</td>
                    <td className="py-2 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${STATE_DOT[state]}`} />
                        <span className={`text-[12px] font-medium ${STATE_TEXT[state]}`}>{STATE_LABEL[state]}</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
