"use client"

import { useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { useResidents } from "@/lib/data"
import {
  Search,
  Dog,
  Cat,
  ChevronDown,
  ChevronUp,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Filter,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

type FilterStatus = "all" | "compliant" | "non-compliant" | "pending"

const FILTER_PILLS: { id: FilterStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "compliant", label: "Compliant" },
  { id: "non-compliant", label: "Non-Compliant" },
  { id: "pending", label: "Pending" },
]

const STATUS_CONFIG = {
  compliant: { label: "Compliant", color: "bg-success/10 text-success", dot: "bg-success" },
  "non-compliant": { label: "Non-Compliant", color: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  pending: { label: "Pending", color: "bg-warning/10 text-[#B8860B]", dot: "bg-warning" },
} as const

export function ManagerResidentsScreen() {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterStatus>("all")
  const [expanded, setExpanded] = useState<number | null>(null)
  const { data: residents } = useResidents()

  const filtered = residents.filter((r) => {
    const matchesSearch =
      search === "" ||
      r.unit.includes(search) ||
      r.resident.toLowerCase().includes(search.toLowerCase()) ||
      r.pets.some((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    const matchesFilter = filter === "all" || r.status === filter
    return matchesSearch && matchesFilter
  })

  const summary = {
    total: residents.length,
    compliant: residents.filter((r) => r.status === "compliant").length,
    nonCompliant: residents.filter((r) => r.status === "non-compliant").length,
    pending: residents.filter((r) => r.status === "pending").length,
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Residents"
        rightAction={
          <button className="p-2" aria-label="Filter">
            <Filter className="h-5 w-5 text-foreground" />
          </button>
        }
      />

      {/* Search */}
      <div className="sticky top-[88px] z-30 bg-background px-4 pb-2">
        <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search unit, resident, or pet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      {/* Filter Pills */}
      <div className="px-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {FILTER_PILLS.map((pill) => (
            <button
              key={pill.id}
              onClick={() => setFilter(pill.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
                filter === pill.id
                  ? "bg-info text-info-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {pill.label}
              {pill.id === "all" && <span className="ml-1 opacity-70">({summary.total})</span>}
              {pill.id === "compliant" && <span className="ml-1 opacity-70">({summary.compliant})</span>}
              {pill.id === "non-compliant" && <span className="ml-1 opacity-70">({summary.nonCompliant})</span>}
              {pill.id === "pending" && <span className="ml-1 opacity-70">({summary.pending})</span>}
            </button>
          ))}
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Summary Banner */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-success/5 border border-success/20 p-2.5 text-center">
            <p className="text-[16px] font-bold text-success">{summary.compliant}</p>
            <p className="text-[9px] font-medium text-muted-foreground">Compliant</p>
          </div>
          <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-2.5 text-center">
            <p className="text-[16px] font-bold text-destructive">{summary.nonCompliant}</p>
            <p className="text-[9px] font-medium text-muted-foreground">Non-Compliant</p>
          </div>
          <div className="rounded-xl bg-warning/5 border border-warning/20 p-2.5 text-center">
            <p className="text-[16px] font-bold text-[#B8860B]">{summary.pending}</p>
            <p className="text-[9px] font-medium text-muted-foreground">Pending</p>
          </div>
        </div>

        {/* Resident List */}
        <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
          {filtered.map((resident) => {
            const statusInfo = STATUS_CONFIG[resident.status]
            const isExpanded = expanded === resident.id
            return (
              <div key={resident.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Row Header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : resident.id)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors active:bg-muted/50"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                    <span className="text-[13px] font-bold text-foreground">{resident.unit}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[14px] font-semibold text-foreground">{resident.resident}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {resident.pets.map((pet, i) => {
                        const SpeciesIcon = pet.species === "dog" ? Dog : Cat
                        return (
                          <span key={i} className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                            <SpeciesIcon className="h-3 w-3" />
                            {pet.name}
                            {i < resident.pets.length - 1 && <span className="ml-1">,</span>}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <Badge className={`border-0 text-[10px] ${statusInfo.color}`}>
                    {statusInfo.label}
                  </Badge>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/30 px-3 pb-3 pt-2.5">
                    {/* Pets */}
                    <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Pets</p>
                    <div className="flex flex-col gap-2 mb-3">
                      {resident.pets.map((pet, i) => {
                        const SpeciesIcon = pet.species === "dog" ? Dog : Cat
                        return (
                          <div key={i} className="flex items-center justify-between rounded-lg bg-card p-2.5">
                            <div className="flex items-center gap-2">
                              <SpeciesIcon className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-[13px] font-semibold text-foreground">{pet.name}</p>
                                <p className="text-[11px] text-muted-foreground">{pet.breed} &middot; {pet.weight}</p>
                              </div>
                            </div>
                            {pet.compliant ? (
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Billing */}
                    <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Billing</p>
                    <div className="flex items-center justify-between rounded-lg bg-card p-2.5 mb-3">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-[13px] font-semibold text-foreground">
                            {resident.billing.outstanding > 0
                              ? `$${resident.billing.outstanding} Outstanding`
                              : "No Balance"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Last payment: {resident.billing.lastPayment}</p>
                        </div>
                      </div>
                      {resident.billing.outstanding > 0 && (
                        <Badge className="bg-destructive/10 text-destructive border-0 text-[10px]">Overdue</Badge>
                      )}
                    </div>

                    {/* Violations */}
                    {resident.violations.length > 0 && (
                      <>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Violation History</p>
                        <div className="flex flex-col gap-1.5">
                          {resident.violations.map((v, i) => (
                            <div key={i} className="flex items-center justify-between rounded-lg bg-card p-2.5">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                                <div>
                                  <p className="text-[12px] font-medium text-foreground">{v.type}</p>
                                  <p className="text-[10px] text-muted-foreground">{v.date}</p>
                                </div>
                              </div>
                              <Badge className="bg-muted text-muted-foreground border-0 text-[9px]">{v.stage}</Badge>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Actions */}
                    <div className="mt-3 flex gap-2">
                      <button className="flex-1 rounded-lg bg-info/10 py-2 text-[12px] font-semibold text-info active:scale-[0.97] transition-transform">
                        Contact Resident
                      </button>
                      {resident.status === "non-compliant" && (
                        <button className="flex-1 rounded-lg bg-destructive/10 py-2 text-[12px] font-semibold text-destructive active:scale-[0.97] transition-transform">
                          Issue Warning
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
