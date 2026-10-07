"use client"

import { Download, Loader2, Printer } from "lucide-react"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { downloadCsv } from "@/lib/csv"
import type { BuildingRules } from "@/lib/data/compliance"
import { complianceCensusCsv, nextExpiry, STAGE_LABEL } from "@/lib/data/compliance-report"
import { useComplianceReport } from "@/lib/data/compliance-report-live"

/**
 * Settings › Compliance Report. One building's pets against its rules: who is
 * registered, who is compliant and what is missing, what has expired or
 * expires within 30 days, and the open cases by stage. Download CSV gives the
 * per-pet census; Print prints only this report (`.print-root` in
 * app/globals.css), so the browser's "Save as PDF" is the PDF.
 */
export function ComplianceReportScreen({
  buildingId,
  buildingName,
  rules,
  onBack,
}: {
  buildingId: string
  buildingName: string
  rules: BuildingRules
  onBack: () => void
}) {
  const { data: report, isLoading, error, refetch } = useComplianceReport(buildingId, rules)
  const generated = new Date().toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })

  function exportCsv() {
    if (!report) return
    const csv = complianceCensusCsv(
      report.rows.map((r) => ({ ...r, nextExpiry: nextExpiry(r) })),
      { detailed: true },
    )
    const slug = buildingName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "building"
    downloadCsv(`compliance-${slug}-${new Date().toLocaleDateString("en-CA")}.csv`, csv)
    toast.success("Compliance report downloaded")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="no-print">
        <IOSNavBar title="Compliance Report" largeTitle={false} leftAction={<NavBackButton onClick={onBack} />} />
      </div>
      <main className="ios-scroll flex-1 px-4 pb-24">
        {isLoading && !report ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error || !report ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-center">
            <p className="text-[13px] text-foreground">{error ?? "Couldn't load the compliance report."}</p>
            <button onClick={() => void refetch()} className="mt-2 text-[13px] font-semibold text-primary">
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="no-print mb-4 flex gap-2">
              <button
                onClick={exportCsv}
                disabled={report.rows.length === 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Download CSV
              </button>
              <button
                onClick={() => window.print()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-muted py-2.5 text-[13.5px] font-semibold text-foreground"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
            </div>

            <article className="print-root space-y-4">
              <header>
                <h2 className="text-[18px] font-semibold text-foreground">{buildingName} — pet compliance</h2>
                <p className="text-[12px] text-muted-foreground">Generated {generated}</p>
              </header>

              <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Figure label="Pets registered" value={report.registered} />
                <Figure label="Awaiting registration" value={report.pending} />
                <Figure label="Fully compliant" value={report.compliant} />
                <Figure label="Missing something" value={report.nonCompliant} tone={report.nonCompliant > 0 ? "warn" : undefined} />
              </section>

              <Card title="Missing requirements">
                {report.missingByItem.length === 0 ? (
                  <Empty text={report.pets === 0 ? "No pets in this building yet." : "Every pet meets every rule."} />
                ) : (
                  <Table
                    head={["Requirement", "Pets missing it"]}
                    rows={report.missingByItem.map((m) => [m.item, String(m.pets)])}
                  />
                )}
              </Card>

              <Card title="Expired or expiring within 30 days">
                {report.expiring.length === 0 ? (
                  <Empty text="Nothing has expired or expires in the next 30 days." />
                ) : (
                  <Table
                    head={["Pet", "Unit", "Record", "Expires"]}
                    rows={report.expiring.map((e) => [
                      e.pet,
                      e.unit ?? "—",
                      e.item,
                      `${e.expiresOn}${e.expired ? " (expired)" : ""}`,
                    ])}
                  />
                )}
              </Card>

              <Card title="Open violations by stage">
                <Table
                  head={["Stage", "Open cases"]}
                  rows={report.openByStage.map((s) => [STAGE_LABEL[s.stage] ?? s.stage, String(s.count)])}
                />
              </Card>

              <Card title={`Pets (${report.pets})`}>
                {report.rows.length === 0 ? (
                  <Empty text="No pets in this building yet." />
                ) : (
                  <Table
                    head={["Pet", "Unit", "Compliance", "Missing"]}
                    rows={report.rows.map((r) => [
                      r.name,
                      r.unit ?? "—",
                      `${r.compliancePct}%`,
                      r.missing.join(", ") || "—",
                    ])}
                  />
                )}
              </Card>
            </article>
          </>
        )}
      </main>
    </div>
  )
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="print-card rounded-xl card-raised p-3">
      <p className={`text-[20px] font-bold tabular-nums ${tone === "warn" ? "text-warning-strong" : "text-foreground"}`}>{value}</p>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="print-card rounded-2xl card-raised p-3.5">
      <h3 className="mb-2 text-[13px] font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-[12.5px] text-muted-foreground">{text}</p>
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="py-1.5 pr-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-3 text-foreground">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
