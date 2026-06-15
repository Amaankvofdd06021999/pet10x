"use client"

import { useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { useRegistrations, useAccommodations, useDocumentsReview } from "@/lib/data"
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
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

type ApprovalTab = "registrations" | "accommodations" | "documents"

const TABS: { id: ApprovalTab; label: string; count: number }[] = [
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
  const [activeTab, setActiveTab] = useState<ApprovalTab>("registrations")
  const [expandedReg, setExpandedReg] = useState<number | null>(1)
  const [expandedAcc, setExpandedAcc] = useState<number | null>(1)
  const { data: registrations } = useRegistrations()
  const { data: accommodations } = useAccommodations()
  const { data: documentsReview } = useDocumentsReview()

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
                        <button onClick={() => toast.success("Approved")} className="flex-1 rounded-lg bg-success/10 py-2 text-[12px] font-semibold text-success active:scale-[0.97] transition-transform">
                          Approve
                        </button>
                        <button onClick={() => toast("Request denied")} className="flex-1 rounded-lg bg-destructive/10 py-2 text-[12px] font-semibold text-destructive active:scale-[0.97] transition-transform">
                          Deny
                        </button>
                        <button onClick={() => toast("Info requested from resident")} className="flex-1 rounded-lg bg-info/10 py-2 text-[12px] font-semibold text-info active:scale-[0.97] transition-transform">
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
                        <button onClick={() => toast.success("Approved")} className="flex-1 rounded-lg bg-success/10 py-2 text-[12px] font-semibold text-success active:scale-[0.97] transition-transform">
                          Approve
                        </button>
                        <button onClick={() => toast("Request denied")} className="flex-1 rounded-lg bg-destructive/10 py-2 text-[12px] font-semibold text-destructive active:scale-[0.97] transition-transform">
                          Deny
                        </button>
                        <button onClick={() => toast.success("Documents verified")} className="flex-1 rounded-lg bg-info/10 py-2 text-[12px] font-semibold text-info active:scale-[0.97] transition-transform">
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
