"use client"

import { useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { useViolations, useResolvedViolations } from "@/lib/data"
import { toast } from "sonner"
import {
  Gavel,
  AlertTriangle,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Plus,
  Download,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

type ViolationTab = "active" | "warnings" | "fines" | "resolved"

const TABS: { id: ViolationTab; label: string; count: number }[] = [
  { id: "active", label: "Active", count: 5 },
  { id: "warnings", label: "Warnings", count: 3 },
  { id: "fines", label: "Fines", count: 2 },
  { id: "resolved", label: "Resolved", count: 8 },
]

const STAGE_CONFIG = {
  "investigation": { color: "bg-destructive/10 text-destructive", icon: AlertTriangle },
  "pending-review": { color: "bg-warning/10 text-[#B8860B]", icon: Clock },
  "verbal-warning": { color: "bg-info/10 text-info", icon: FileText },
  "written-warning": { color: "bg-warning/10 text-[#B8860B]", icon: Gavel },
  "fine-issued": { color: "bg-destructive/10 text-destructive", icon: DollarSign },
} as const

export function ManagerViolationsScreen() {
  const [activeTab, setActiveTab] = useState<ViolationTab>("active")
  const { data: violations } = useViolations()
  const { data: resolvedViolations } = useResolvedViolations()

  const activeViolations = violations.filter((v) => v.tab === "active")
  const warningViolations = violations.filter((v) => v.tab === "warnings")
  const fineViolations = violations.filter((v) => v.tab === "fines")

  const totalFines = fineViolations.reduce((sum, v) => sum + v.amount, 0)
  const unpaidFines = fineViolations.filter((v) => !v.paid).reduce((sum, v) => sum + v.amount, 0)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Violations"
        rightAction={
          <div className="flex items-center gap-1">
            <button onClick={() => toast.success("Violations exported")} className="p-2" aria-label="Export">
              <Download className="h-5 w-5 text-foreground" />
            </button>
            <button onClick={() => toast("Log a violation — coming soon")} className="p-2" aria-label="New violation">
              <Plus className="h-5 w-5 text-info" />
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="sticky top-[88px] z-30 bg-background px-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-info text-info-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {tab.label}
              <span className="ml-1 opacity-70">({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Fines Summary — show on fines tab */}
        {activeTab === "fines" && (
          <div className="mb-4 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Total Fines Issued</p>
                <p className="text-[22px] font-bold text-foreground">${totalFines}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium text-muted-foreground">Unpaid</p>
                <p className="text-[22px] font-bold text-destructive">${unpaidFines}</p>
              </div>
            </div>
          </div>
        )}

        {/* Violation Cards */}
        {activeTab !== "resolved" ? (
          <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
            {(activeTab === "active" ? activeViolations :
              activeTab === "warnings" ? warningViolations :
              fineViolations
            ).map((violation) => {
              const stageInfo = STAGE_CONFIG[violation.stage]
              const StageIcon = stageInfo.icon
              return (
                <div key={violation.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="p-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-[12px] font-bold text-foreground">
                            {violation.unit}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-foreground">{violation.type}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{violation.resident} &middot; {violation.pet}</p>
                          </div>
                        </div>
                      </div>
                      <Badge className={`border-0 text-[9px] flex-shrink-0 ${stageInfo.color}`}>
                        {violation.stageLabel}
                      </Badge>
                    </div>

                    {/* Enforcement Pipeline */}
                    <div className="mt-3 flex items-center gap-1">
                      {violation.history.map((step, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                            <span className="text-[9px] font-medium text-foreground">{step.stage}</span>
                          </div>
                          {i < violation.history.length - 1 && (
                            <ArrowRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Fine Amount */}
                    {violation.amount > 0 && (
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-destructive/5 px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="h-3.5 w-3.5 text-destructive" />
                          <span className="text-[13px] font-bold text-destructive">${violation.amount}</span>
                        </div>
                        <Badge className={`border-0 text-[9px] ${violation.paid ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                          {violation.paid ? "Paid" : "Unpaid"}
                        </Badge>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="mt-2.5 flex gap-2">
                      {violation.stage === "investigation" && (
                        <>
                          <button onClick={() => toast("Investigation started")} className="flex-1 rounded-lg bg-info/10 py-2 text-[12px] font-semibold text-info active:scale-[0.97] transition-transform">
                            Investigate
                          </button>
                          <button onClick={() => toast.success("Warning issued")} className="flex-1 rounded-lg bg-destructive/10 py-2 text-[12px] font-semibold text-destructive active:scale-[0.97] transition-transform">
                            Issue Warning
                          </button>
                        </>
                      )}
                      {violation.stage === "pending-review" && (
                        <button onClick={() => toast("Reviewing case")} className="flex-1 rounded-lg bg-info/10 py-2 text-[12px] font-semibold text-info active:scale-[0.97] transition-transform">
                          Review Case
                        </button>
                      )}
                      {(violation.stage === "verbal-warning" || violation.stage === "written-warning") && (
                        <>
                          <button onClick={() => toast("Escalated to next stage")} className="flex-1 rounded-lg bg-warning/10 py-2 text-[12px] font-semibold text-[#B8860B] active:scale-[0.97] transition-transform">
                            Escalate
                          </button>
                          <button onClick={() => toast.success("Marked resolved")} className="flex-1 rounded-lg bg-success/10 py-2 text-[12px] font-semibold text-success active:scale-[0.97] transition-transform">
                            Resolve
                          </button>
                        </>
                      )}
                      {violation.stage === "fine-issued" && (
                        <>
                          <button onClick={() => toast.success("Reminder sent")} className="flex-1 rounded-lg bg-info/10 py-2 text-[12px] font-semibold text-info active:scale-[0.97] transition-transform">
                            Send Reminder
                          </button>
                          <button onClick={() => toast("Escalated to CRT")} className="flex-1 rounded-lg bg-destructive/10 py-2 text-[12px] font-semibold text-destructive active:scale-[0.97] transition-transform">
                            Escalate to CRT
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Resolved list */
          <div className="grid gap-2 lg:grid-cols-2 lg:items-start">
            {resolvedViolations.map((v) => (
              <div key={v.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-success" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">Unit {v.unit} — {v.type}</p>
                  <p className="text-[11px] text-muted-foreground">{v.outcome}</p>
                </div>
                <span className="flex-shrink-0 text-[10px] text-muted-foreground">{v.resolved}</span>
              </div>
            ))}
          </div>
        )}

        {/* Export CRT Button */}
        <div className="mt-4">
          <button onClick={() => toast.success("CRT evidence package exported")} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 active:scale-[0.98] transition-transform">
            <Download className="h-4 w-4 text-info" />
            <span className="text-[13px] font-semibold text-info">Export CRT Evidence Package</span>
          </button>
        </div>
      </main>
    </div>
  )
}
