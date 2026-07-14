"use client"

import { useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { useRegistrations, useAccommodations, useDocumentsReview } from "@/lib/data"
import {
  useRegistrationsLive,
  useAccommodationsLive,
  decideRegistration,
  decideAccommodation,
} from "@/lib/data/manager-queues"
import {
  useIncidents,
  setIncidentStatus,
  escalateIncident,
  isOpenIncident,
  INCIDENT_TYPE_LABEL,
  INCIDENT_STATUS_LABEL,
  type ManagerIncident,
} from "@/lib/data/incidents"
import { toast } from "sonner"
import {
  Dog,
  Cat,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  Shield,
  Syringe,
  Scale,
  Heart,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Inbox,
  Gavel,
  Loader2,
  UserX,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

type ApprovalTab = "incidents" | "registrations" | "accommodations" | "documents"

const STATIC_TABS: { id: ApprovalTab; label: string; count: number }[] = [
  { id: "registrations", label: "Registrations", count: 3 },
  { id: "accommodations", label: "Accommodations", count: 2 },
  { id: "documents", label: "Documents", count: 4 },
]

function ApprovalsEmptyState({ title, subtext }: { title: string; subtext: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Inbox className="h-6 w-6 text-primary" />
      </div>
      <h3 className="mt-4 text-[15px] font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-[22rem] text-[13px] leading-relaxed text-muted-foreground">{subtext}</p>
    </div>
  )
}

export function ManagerApprovalsScreen() {
  const [activeTab, setActiveTab] = useState<ApprovalTab>("incidents")
  const [expandedReg, setExpandedReg] = useState<string | null>(null)
  const [expandedAcc, setExpandedAcc] = useState<string | null>(null)
  const { data: registrations, refetch: refetchRegs } = useRegistrationsLive()
  const { data: accommodations, refetch: refetchAcc } = useAccommodationsLive()
  const { data: documentsReview } = useDocumentsReview()
  const { data: incidents, isLoading: incidentsLoading, refetch: refetchIncidents } = useIncidents()

  const openIncidents = incidents.filter((i) => isOpenIncident(i.status))
  const TABS = [{ id: "incidents" as ApprovalTab, label: "Incidents", count: openIncidents.length }, ...STATIC_TABS]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar title="Approvals" />

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
        {/* Incidents — where guest and resident reports land for triage. */}
        {activeTab === "incidents" && (
          <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
            {incidentsLoading ? (
              <div className="flex justify-center py-10 lg:col-span-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : incidents.length === 0 ? (
              <div className="lg:col-span-2">
                <ApprovalsEmptyState
                  title="No incidents reported"
                  subtext="Reports filed by residents or guests using your building code will appear here for triage."
                />
              </div>
            ) : (
              incidents.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} onChange={refetchIncidents} />
              ))
            )}
          </div>
        )}

        {/* Registrations Tab */}
        {activeTab === "registrations" && (
          <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
            {registrations.length === 0 && (
              <div className="lg:col-span-2">
                <ApprovalsEmptyState
                  title="Nothing pending"
                  subtext="No new pet registrations are waiting for review. Submissions from residents will appear here."
                />
              </div>
            )}
            {registrations.map((reg) => {
              const isOpen = expandedReg === reg.id
              const SpeciesIcon = reg.species === "dog" ? Dog : Cat
              return (
                <div key={reg.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setExpandedReg(isOpen ? null : reg.id)}
                    className="flex w-full items-center gap-3 p-3 text-left active:bg-muted/50"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <SpeciesIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-foreground">{reg.name} — Unit {reg.unit}</p>
                      <p className="text-[11px] text-muted-foreground">{reg.breed} &middot; {reg.weight} &middot; {reg.age}</p>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border bg-muted/30 px-3 pb-3 pt-2.5">
                      <p className="text-[11px] text-muted-foreground mb-2">Submitted by {reg.resident} on {reg.submitted}</p>

                      {/* Flags */}
                      {reg.flags.length > 0 && (
                        <div className="mb-3 flex flex-col gap-1.5">
                          {reg.flags.map((flag, i) => (
                            <div key={i} className="flex items-start gap-2 rounded-lg bg-warning/5 border border-warning/20 p-2">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-[#B8860B]" />
                              <span className="text-[11px] text-foreground">{flag}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Document Checklist */}
                      <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Documents</p>
                      <div className="flex flex-col gap-1 mb-3">
                        {Object.entries(reg.documents).map(([key, ok]) => (
                          <div key={key} className="flex items-center gap-2">
                            {ok ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive" />
                            )}
                            <span className="text-[12px] text-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            const { error } = await decideRegistration(reg.id, true)
                            if (error) return toast.error("Couldn't approve", { description: error })
                            toast.success(`${reg.name} approved`)
                            refetchRegs()
                          }}
                          className="flex-1 rounded-lg bg-success/10 py-2 text-[12px] font-semibold text-success active:scale-[0.97] transition-transform">
                          Approve
                        </button>
                        <button
                          onClick={async () => {
                            const { error } = await decideRegistration(reg.id, false)
                            if (error) return toast.error("Couldn't deny", { description: error })
                            toast(`${reg.name} denied`)
                            refetchRegs()
                          }}
                          className="flex-1 rounded-lg bg-destructive/10 py-2 text-[12px] font-semibold text-destructive active:scale-[0.97] transition-transform">
                          Deny
                        </button>
                        <button
                          onClick={() => toast("Info requested", { description: "Messaging the resident isn't built yet." })}
                          className="flex-1 rounded-lg bg-info/10 py-2 text-[12px] font-semibold text-info active:scale-[0.97] transition-transform">
                          Request Info
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Accommodations Tab */}
        {activeTab === "accommodations" && (
          <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
            {accommodations.length === 0 && (
              <div className="lg:col-span-2">
                <ApprovalsEmptyState
                  title="Nothing pending"
                  subtext="No ESA or service animal accommodation requests are awaiting review."
                />
              </div>
            )}
            {accommodations.map((acc) => {
              const isOpen = expandedAcc === acc.id
              return (
                <div key={acc.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setExpandedAcc(isOpen ? null : acc.id)}
                    className="flex w-full items-center gap-3 p-3 text-left active:bg-muted/50"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
                      {acc.type === "ESA" ? <Heart className="h-5 w-5 text-accent" /> : <Shield className="h-5 w-5 text-accent" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[14px] font-semibold text-foreground">{acc.type}</p>
                        <Badge className="bg-accent/10 text-accent border-0 text-[9px]">{acc.type}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{acc.animal} &middot; Unit {acc.unit}</p>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border bg-muted/30 px-3 pb-3 pt-2.5">
                      <p className="text-[11px] text-muted-foreground mb-2">Submitted by {acc.resident} on {acc.submitted}</p>

                      {/* Legal Guidance */}
                      <div className="mb-3 rounded-lg bg-info/5 border border-info/20 p-2.5">
                        <div className="flex items-start gap-2">
                          <Scale className="h-4 w-4 mt-0.5 flex-shrink-0 text-info" />
                          <div>
                            <p className="text-[11px] font-semibold text-info">Legal Guidance</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-foreground">{acc.legalNote}</p>
                          </div>
                        </div>
                      </div>

                      {/* Documents */}
                      <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Documentation</p>
                      <div className="flex flex-col gap-1 mb-3">
                        {Object.entries(acc.documents).map(([key, ok]) => (
                          <div key={key} className="flex items-center gap-2">
                            {ok ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive" />
                            )}
                            <span className="text-[12px] text-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            const { error } = await decideAccommodation(acc.id, "approved")
                            if (error) return toast.error("Couldn't approve", { description: error })
                            toast.success("Accommodation approved", { description: "Decision logged for the audit trail." })
                            refetchAcc()
                          }}
                          className="flex-1 rounded-lg bg-success/10 py-2 text-[12px] font-semibold text-success active:scale-[0.97] transition-transform">
                          Approve
                        </button>
                        <button
                          onClick={async () => {
                            const { error } = await decideAccommodation(acc.id, "denied")
                            if (error) return toast.error("Couldn't deny", { description: error })
                            toast("Accommodation denied", { description: "Document your reasoning — this is CRT-relevant." })
                            refetchAcc()
                          }}
                          className="flex-1 rounded-lg bg-destructive/10 py-2 text-[12px] font-semibold text-destructive active:scale-[0.97] transition-transform">
                          Deny
                        </button>
                        <button
                          onClick={async () => {
                            const { error } = await decideAccommodation(acc.id, "info_requested")
                            if (error) return toast.error("Couldn't update", { description: error })
                            toast("More information requested")
                            refetchAcc()
                          }}
                          className="flex-1 rounded-lg bg-info/10 py-2 text-[12px] font-semibold text-info active:scale-[0.97] transition-transform">
                          Verify Docs
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <div className="flex flex-col gap-2.5">
            {/* Expiring Soon Header */}
            <div className="mb-1">
              <p className="text-[12px] font-semibold text-muted-foreground">Document renewals and expirations</p>
            </div>
            {documentsReview.length === 0 && (
              <ApprovalsEmptyState
                title="Nothing pending"
                subtext="No documents need review and nothing is expiring soon. Renewals and flagged records will show up here."
              />
            )}
            {documentsReview.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  doc.status === "expiring" ? "bg-warning/10" : "bg-success/10"
                }`}>
                  {doc.status === "expiring" ? (
                    <Clock className="h-4 w-4 text-[#B8860B]" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13px] font-semibold text-foreground">{doc.type}</p>
                  <p className="text-[11px] text-muted-foreground">{doc.pet} &middot; Unit {doc.unit}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <Badge className={`border-0 text-[9px] ${
                    doc.status === "expiring"
                      ? "bg-warning/10 text-[#B8860B]"
                      : "bg-success/10 text-success"
                  }`}>
                    {doc.status === "expiring" ? "Expiring" : "Current"}
                  </Badge>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{doc.expiring}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Incident triage — the manager's half of the reporting loop.         */
/* ------------------------------------------------------------------ */

const INCIDENT_STATUS_STYLE: Record<string, string> = {
  submitted: "bg-destructive/10 text-destructive",
  triaged: "bg-info/10 text-info",
  investigating: "bg-warning/10 text-[#B8860B]",
  linked_to_violation: "bg-primary/10 text-primary",
  dismissed: "bg-muted text-muted-foreground",
  resolved: "bg-success/10 text-success",
}

function IncidentCard({ incident, onChange }: { incident: ManagerIncident; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const open = isOpenIncident(incident.status)

  async function move(status: Parameters<typeof setIncidentStatus>[1], label: string) {
    setBusy(true)
    const { error } = await setIncidentStatus(incident.id, status)
    setBusy(false)
    if (error) return toast.error("Couldn't update", { description: error })
    toast.success(label)
    onChange()
  }

  async function escalate() {
    setBusy(true)
    const { error } = await escalateIncident(incident.id)
    setBusy(false)
    if (error) return toast.error("Couldn't escalate", { description: error })
    toast.success("Escalated to a violation", {
      description: "A violation was opened and linked to this report.",
    })
    onChange()
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-foreground">
              {INCIDENT_TYPE_LABEL[incident.type]}
            </h3>
            <Badge className={`border-0 text-[10px] ${INCIDENT_STATUS_STYLE[incident.status] ?? "bg-muted"}`}>
              {INCIDENT_STATUS_LABEL[incident.status]}
            </Badge>
            {incident.isAnonymous && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <UserX className="h-3 w-3" /> Anonymous
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{incident.description}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {incident.reference && <span className="font-mono">{incident.reference}</span>}
            {incident.location && <> &middot; {incident.location}</>}
            {incident.unitInvolved && <> &middot; Unit {incident.unitInvolved}</>}
            {" · "}
            {new Date(incident.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {incident.status === "submitted" && (
            <button
              onClick={() => move("triaged", "Acknowledged")}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[12px] font-semibold text-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Acknowledge
            </button>
          )}
          {incident.status !== "investigating" && (
            <button
              onClick={() => move("investigating", "Marked as investigating")}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-1.5 text-[12px] font-semibold text-[#B8860B] disabled:opacity-60"
            >
              <Clock className="h-3.5 w-3.5" /> Investigate
            </button>
          )}
          <button
            onClick={escalate}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-[12px] font-semibold text-destructive disabled:opacity-60"
          >
            <Gavel className="h-3.5 w-3.5" /> Escalate to violation
          </button>
          <button
            onClick={() => move("resolved", "Marked resolved")}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-[12px] font-semibold text-success disabled:opacity-60"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
          </button>
          <button
            onClick={() => move("dismissed", "Dismissed")}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[12px] font-semibold text-muted-foreground disabled:opacity-60"
          >
            <XCircle className="h-3.5 w-3.5" /> Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
