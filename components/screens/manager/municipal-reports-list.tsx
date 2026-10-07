"use client"

import { Info, Loader2, MapPin, Paperclip, Landmark } from "lucide-react"
import { useManagerMunicipalReports } from "@/lib/data/municipal"
import { shortDate } from "@/lib/dates"
import { Badge } from "@/components/ui/badge"

const TYPE_TINT: Record<string, string> = {
  attack_on_person: "bg-destructive/10 text-destructive",
  attack_on_pet: "bg-destructive/10 text-destructive",
  dangerous_animal: "bg-warning/10 text-warning-strong",
  animal_at_large: "bg-info/10 text-info",
}

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  closed: "Closed",
}

/**
 * City reports about the area a building is in. Read-only.
 *
 * Shared by the manager's Incidents screen and the strata building detail so
 * the two cannot disagree about what a manager is shown — and, above all,
 * about the disclosure. These reports went to Pet10x, not to the city: Pet10x
 * files nothing with any municipality, and a manager reading this list must
 * not come away thinking animal control has it. Who filed each report is
 * never shown; the function behind it does not return it.
 */
export function MunicipalReportsList({ buildingId }: { buildingId: string | null | undefined }) {
  const { data: reports, isLoading, error, refetch } = useManagerMunicipalReports(buildingId)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Pet10x does not file with the city.</span> These are reports
          people made through Pet10x about animals in your building&apos;s city, matched on its postal code. They were
          not sent to animal control, and who made them is not shown.
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
      ) : reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Landmark className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-[15px] font-semibold text-foreground">No city reports</h3>
          <p className="mx-auto mt-1 max-w-[24rem] text-[13px] leading-relaxed text-muted-foreground">
            Nobody has reported an animal in this building&apos;s city through Pet10x — or the building has no postal
            code to match on.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
          {reports.map((r) => (
            <li key={r.id} className="rounded-xl card-raised p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`border-0 text-[10px] ${TYPE_TINT[r.type] ?? "bg-muted text-muted-foreground"}`}>
                  {r.typeLabel}
                </Badge>
                <span className="text-[11.5px] tabular-nums text-muted-foreground">{shortDate(r.createdAt, "—")}</span>
                <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{r.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                {r.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {r.location}
                  </span>
                )}
                {r.evidenceCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> {r.evidenceCount} file
                    {r.evidenceCount === 1 ? "" : "s"}
                  </span>
                )}
                {r.reference && <span className="tabular-nums">{r.reference}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
