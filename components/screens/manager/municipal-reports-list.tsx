"use client"

import { useMemo } from "react"
import { Info, Loader2, Landmark } from "lucide-react"
import { useManagerMunicipalReports, municipalTypeLabel } from "@/lib/data/municipal"
import { summariseMunicipalReports } from "@/lib/data/municipal-summary"
import { Badge } from "@/components/ui/badge"

const TYPE_TINT: Record<string, string> = {
  attack_on_person: "bg-destructive/10 text-destructive",
  attack_on_pet: "bg-destructive/10 text-destructive",
  dangerous_animal: "bg-warning/10 text-warning-strong",
  animal_at_large: "bg-info/10 text-info",
}

/**
 * City reports about the area a building is in, as counts. Read-only.
 *
 * A SUMMARY, NOT A LIST, deliberately. 20260810000006 kept these reports from
 * managers because, in a small building, what was written and where it
 * happened identify whoever wrote it. So a manager sees how many of each kind
 * were reported in their city, month by month, and nothing else — the
 * function behind this returns nothing else (20261008000005).
 *
 * Shared by the manager's Incidents screen and the strata building detail so
 * the two cannot disagree, above all about the disclosure: these went to
 * Pet10x, not to the city. Pet10x files nothing with any municipality.
 */
export function MunicipalReportsList({ buildingId }: { buildingId: string | null | undefined }) {
  const { data: reports, isLoading, error, refetch } = useManagerMunicipalReports(buildingId)
  const summary = useMemo(() => summariseMunicipalReports(reports), [reports])
  const city = reports[0]?.municipality

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Pet10x does not file with the city.</span> These are counts of
          reports people made through Pet10x about animals in your building&apos;s city. They were not sent to animal
          control. To protect the people who made them, what was written, where and by whom is not shown.
        </p>
      </div>

      {!buildingId ? null : isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading city reports" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[12.5px] text-destructive">
          {error}{" "}
          <button onClick={refetch} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : summary.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Landmark className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-[15px] font-semibold text-foreground">No city reports</h3>
          <p className="mx-auto mt-1 max-w-[24rem] text-[13px] leading-relaxed text-muted-foreground">
            Nobody has reported an animal in this building&apos;s city through Pet10x — or a Pet10x admin has not set
            which city the building is in yet.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl card-raised p-3.5">
            <p className="text-[13px] font-semibold text-foreground">
              {summary.total} report{summary.total === 1 ? "" : "s"}
              {city ? ` in ${city}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {summary.byType.map((t) => (
                <Badge key={t.type} className={`border-0 text-[11px] ${TYPE_TINT[t.type] ?? "bg-muted text-muted-foreground"}`}>
                  {municipalTypeLabel(t.type)} · {t.count}
                </Badge>
              ))}
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {summary.byMonth.map((m) => (
              <li key={m.month} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl card-raised px-3.5 py-2.5">
                <span className="w-32 text-[12.5px] font-semibold text-foreground">{m.label}</span>
                <span className="flex flex-1 flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                  {Object.entries(m.counts).map(([type, n]) => (
                    <span key={type}>
                      {municipalTypeLabel(type)} <span className="tabular-nums text-foreground">{n}</span>
                    </span>
                  ))}
                </span>
                <span className="text-[12px] tabular-nums text-muted-foreground">{m.total}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
