"use client"

import { useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { useRegistrations, useDocumentsReview } from "@/lib/data"
import { useRegistrationsLive, decideRegistration } from "@/lib/data/manager-queues"
import {
  useAccommodationsLive,
  useAccommodationDocuments,
  decideAccommodation,
  verifyAccommodationDocument,
  type AccommodationRequestView,
} from "@/lib/data/accommodations-live"
import {
  checklistFor,
  missingRequired,
  allRequiredVerified,
  fileSize,
  ACCOMMODATION_TYPE_LABEL,
  STATUS_LABEL,
  type ChecklistItem,
} from "@/lib/data/accommodations"
import { AccommodationDocumentViewer } from "@/components/screens/manager/accommodation-document-viewer"
import { shortDate } from "@/lib/dates"
import { useIncidents, isOpenIncident } from "@/lib/data/incidents"
import { IncidentCard } from "@/components/screens/manager/incident-card"
import { toast } from "sonner"
import {
  Dog,
  Cat,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Scale,
  Heart,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Inbox,
  Loader2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Portal } from "@/components/ui/portal"

type ApprovalTab = "incidents" | "registrations" | "accommodations" | "documents"

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

export function ManagerApprovalsScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const [activeTab, setActiveTab] = useState<ApprovalTab>("incidents")
  const [expandedReg, setExpandedReg] = useState<string | null>(null)
  const [expandedAcc, setExpandedAcc] = useState<string | null>(null)
  const { data: registrations, refetch: refetchRegs } = useRegistrationsLive()
  const { data: accommodations, refetch: refetchAcc } = useAccommodationsLive()
  const { data: documentsReview } = useDocumentsReview()
  const { data: incidents, isLoading: incidentsLoading, refetch: refetchIncidents } = useIncidents()

  const openIncidents = incidents.filter((i) => isOpenIncident(i.status))
  // Every count is derived. These were hardcoded 3 / 2 / 4 while the lists
  // beneath them came from live queries, so a tab could advertise rows that
  // did not exist — and did, on every empty building.
  const TABS: { id: ApprovalTab; label: string; count: number }[] = [
    { id: "incidents", label: "Incidents", count: openIncidents.length },
    { id: "registrations", label: "Registrations", count: registrations.length },
    { id: "accommodations", label: "Accommodations", count: accommodations.length },
    { id: "documents", label: "Documents", count: documentsReview.length },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Approvals"
        largeTitle={false}
        leftAction={<NavBackButton onClick={() => onNavigate?.("dashboard")} />}
      />

      {/* Tabs */}
      <div className="sticky top-16 z-30 bg-background px-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
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
                <div key={reg.id} className="rounded-xl card-raised overflow-hidden">
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
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-warning-strong" />
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
                        {/* No "Request Info" here.
                            It toasted "Messaging the resident isn't built yet",
                            which was a claim about the product rather than
                            about this button: asking a resident for details IS
                            built and works — `RequestInfoButton` on the
                            Residents screen posts to /api/manager/request-info,
                            stamps `resident_links.info_requested_at`, notifies
                            in-app and emails.

                            It could not be reused HERE without building
                            something new. That endpoint is keyed on
                            `resident_links.id`; this row is a PET
                            (`decideRegistration` takes a pet id) and
                            `useRegistrationsLive` selects no owner id and no
                            link id, so there is nothing to resolve a link from.
                            Adding that is a data-layer change no phase owns —
                            recorded in
                            docs/superpowers/2026-08-21-deferred-controls.md.
                            Removed rather than disabled because the capability
                            is not missing, only its shortcut: the manager
                            reaches it in two taps from Residents. */}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Accommodations Tab — every control reaches the database, and every
            state shown is derived from a row that exists. See AccommodationsTab. */}
        {activeTab === "accommodations" && <AccommodationsTab requests={accommodations} refetch={refetchAcc} />}

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
              <div key={doc.id} className="flex items-center gap-3 rounded-xl card-raised p-3">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  doc.status === "expiring" ? "bg-warning/10" : "bg-success/10"
                }`}>
                  {doc.status === "expiring" ? (
                    <Clock className="h-4 w-4 text-warning-strong" />
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
                      ? "bg-warning/10 text-warning-strong"
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
/* Accommodations                                                      */
/* ------------------------------------------------------------------ */

/**
 * WHAT THIS REPLACED.
 *
 * The old tab rendered `Object.entries(acc.documents)` — four booleans, two of
 * them LITERAL `true` at their producer — so every manager saw green ticks for
 * an ESA letter and a vaccination record that nobody had uploaded and nobody
 * could have. Beneath them sat three buttons that called a bare `.update()` and
 * toasted "Decision logged for the audit trail". There was no audit row, no
 * notification, and no column to record why.
 *
 * Now: `checklistFor` derives every state from documents that exist,
 * `manager_decide_accommodation` writes the audit row and the notification, and
 * a denial cannot be submitted without a reason — asked for by the sheet, and
 * enforced by a CHECK constraint underneath it, so the two cannot disagree.
 *
 * `legal_note` is rendered as SHARED guidance, not as private counsel.
 * `accom_select` admits `resident_id = auth.uid()`, so the resident can read
 * that column today and nothing in this phase changed that. Labelling it
 * "private" would be this screen making a false statement about the database.
 */
function AccommodationsTab({
  requests,
  refetch,
}: {
  requests: AccommodationRequestView[]
  refetch: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (requests.length === 0) {
    return (
      <div className="lg:col-span-2">
        <ApprovalsEmptyState
          title="Nothing pending"
          subtext="No ESA or service animal accommodation requests are awaiting review."
        />
      </div>
    )
  }

  return (
    <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
      {requests.map((req) => (
        <AccommodationCard
          key={req.id}
          request={req}
          isOpen={expanded === req.id}
          onToggle={() => setExpanded(expanded === req.id ? null : req.id)}
          refetch={refetch}
        />
      ))}
    </div>
  )
}

const CHECK_TONE: Record<ChecklistItem["state"], string> = {
  verified: "text-success",
  provided: "text-warning",
  rejected: "text-destructive",
  missing: "text-muted-foreground",
}
const CHECK_WORD: Record<ChecklistItem["state"], string> = {
  verified: "Verified",
  provided: "Provided, not yet verified",
  rejected: "Rejected",
  missing: "Not provided",
}
/* `animal_desc` is not a document and cannot be verified — there is no file to
 * open and no verdict to record. It read "Provided, not yet verified", which
 * described a review step that does not exist and cannot be completed, leaving
 * a manager looking for a control that was never there. */
const DESC_WORD: Record<ChecklistItem["state"], string> = {
  verified: "Provided",
  provided: "Provided",
  rejected: "Provided",
  missing: "Not provided",
}

function AccommodationCard({
  request,
  isOpen,
  onToggle,
  refetch,
}: {
  request: AccommodationRequestView
  isOpen: boolean
  onToggle: () => void
  refetch: () => void
}) {
  /* The documents are fetched only for the card that is open. A manager's queue
     can hold dozens of requests, and a doctor's letter is not something to
     prefetch for every one of them on the chance somebody expands it. */
  const { data: documents, refetch: refetchDocs } = useAccommodationDocuments(isOpen ? request.id : undefined)
  const [viewing, setViewing] = useState<string | null>(null)
  const [decision, setDecision] = useState<null | "approved" | "denied" | "info_requested">(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const items = checklistFor({ type: request.type, animalDesc: request.animalDesc }, documents)
  const missing = missingRequired(items)
  // UI-ONLY. `manager_decide_accommodation` has no all-verified gate and will
  // approve a request whose documents nobody ticked. The RPC is the authority;
  // this is the screen declining to make the decision easy to take blind. See
  // the note above `allRequiredVerified` in lib/data/accommodations.ts.
  const readyToApprove = allRequiredVerified(items)
  const isOpenRequest = request.status === "pending" || request.status === "info_requested"
  const viewingDoc = documents.find((d) => d.id === viewing) ?? null

  async function runDecision(outcome: "approved" | "denied" | "info_requested", text: string) {
    setBusy(true)
    const res = await decideAccommodation(request.id, outcome, text || undefined)
    setBusy(false)
    if (!res.ok) return toast.error("That decision didn't go through", { description: res.error ?? undefined })
    setDecision(null)
    setNote("")
    toast.success(
      outcome === "approved" ? "Accommodation approved" : outcome === "denied" ? "Accommodation denied" : "More information requested",
      {
        description: res.petRegistrationApproved
          ? "The resident has been notified, and the named pet is now registered."
          : "The resident has been notified.",
      },
    )
    refetch()
    refetchDocs()
  }

  return (
    <div className={`rounded-xl card-raised overflow-hidden ${request.status === "withdrawn" ? "opacity-60" : ""}`}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left active:bg-muted/50"
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
          {request.type === "esa" ? <Heart className="h-5 w-5 text-accent" /> : <Shield className="h-5 w-5 text-accent" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[14px] font-semibold text-foreground break-words">
              {ACCOMMODATION_TYPE_LABEL[request.type]}
            </p>
            <Badge className="border-0 bg-accent/10 text-[9px] text-accent">{STATUS_LABEL[request.status]}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground break-words">
            {/* Three different facts, said as three different things. A request
                may name no pet at all; it may name one whose record this
                manager cannot read (measured: a live MCR request names a pet
                whose `building_id` is null, so `manages_building` is false and
                `pets_select` returns nothing); or it may name one they can.
                Rendering the middle case as "No pet named" would be this screen
                asserting something about the request that is not true — the
                same shape as `emergency_directory` documenting that it withheld
                medical history while returning it. */}
            {request.petName ?? (request.petId ? "Names a pet you can't open" : "No pet named")} &middot; Unit{" "}
            {request.unit}
          </p>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-border bg-muted/30 px-3 pb-3 pt-2.5">
          <p className="mb-2 text-[11px] text-muted-foreground break-words">
            {request.residentName}
            {request.submittedAt ? ` · submitted ${shortDate(request.submittedAt)}` : ""}
            {request.withdrawnAt ? ` · withdrawn ${shortDate(request.withdrawnAt)}` : ""}
          </p>

          {request.animalDesc && (
            <div className="mb-3 rounded-lg border border-border bg-background p-2.5">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">In the resident&apos;s words</p>
              {/* break-words, not pre-wrap alone. `whitespace-pre-wrap` wraps at
                  spaces only, and Phase 6 clipped 3526px of a resident's text
                  out of view because the clipping ancestor is overflow-x:auto. */}
              <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground">
                {request.animalDesc}
              </p>
            </div>
          )}

          {request.legalNote && (
            <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
              <div className="flex items-start gap-2">
                <Scale className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-primary">Guidance (the resident can read this)</p>
                  <p className="mt-0.5 break-words text-[11px] leading-relaxed text-foreground">{request.legalNote}</p>
                </div>
              </div>
            </div>
          )}

          <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Documentation</p>
          <div className="mb-3 flex flex-col gap-1.5">
            {items.map((item) => {
              const doc = item.documentId ? documents.find((d) => d.id === item.documentId) : undefined
              return (
                <div key={item.kind} className="rounded-lg border border-border bg-background p-2">
                  <div className="flex items-start gap-2">
                    {item.state === "verified" ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-success" />
                    ) : item.state === "rejected" ? (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
                    ) : item.state === "provided" ? (
                      <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[12px] font-medium text-foreground">
                        {item.label}
                        {item.required ? "" : " (optional)"}
                      </p>
                      <p className={`text-[11px] ${CHECK_TONE[item.state]}`}>
                        {item.kind === "animal_desc" ? DESC_WORD[item.state] : CHECK_WORD[item.state]}
                      </p>
                      {doc && (
                        <p className="mt-0.5 break-words text-[10px] text-muted-foreground">
                          {doc.label ?? "Untitled"} &middot; {fileSize(doc.sizeBytes)}
                          {doc.uploadedAt ? ` · ${shortDate(doc.uploadedAt)}` : ""}
                        </p>
                      )}
                    </div>
                    {doc && doc.storagePath && (
                      <button
                        onClick={() => setViewing(doc.id)}
                        className="flex-shrink-0 rounded-lg bg-muted px-2 py-1 text-[11px] font-semibold text-foreground"
                      >
                        Open
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {isOpenRequest ? (
            <>
              {!readyToApprove && (
                <p className="mb-2 break-words text-[11px] text-muted-foreground">
                  {missing.length > 0
                    ? `Approve is unavailable until this is provided: ${missing.join(", ")}.`
                    : "Approve is unavailable until every required document is verified. Open each one and record a verdict."}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={!readyToApprove || busy}
                  onClick={() => runDecision("approved", "")}
                  className="flex-1 rounded-lg bg-success/10 py-2 text-[12px] font-semibold text-success transition-transform active:scale-[0.97] disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  disabled={busy}
                  onClick={() => setDecision("denied")}
                  className="flex-1 rounded-lg bg-destructive/10 py-2 text-[12px] font-semibold text-destructive transition-transform active:scale-[0.97] disabled:opacity-50"
                >
                  Deny
                </button>
                {/* Was "Verify Docs". It never verified anything — it set
                    info_requested. Renamed to what it does, and it now carries
                    the note that makes "we need more" actionable. */}
                <button
                  disabled={busy}
                  onClick={() => setDecision("info_requested")}
                  className="flex-1 rounded-lg bg-primary/10 py-2 text-[12px] font-semibold text-primary transition-transform active:scale-[0.97] disabled:opacity-50"
                >
                  Request more information
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-border bg-background p-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground">
                {STATUS_LABEL[request.status]}
                {request.decidedAt ? ` · ${shortDate(request.decidedAt)}` : ""}
              </p>
              {request.decisionNote && (
                <p className="mt-1 whitespace-pre-wrap break-words text-[12px] text-foreground">
                  {request.decisionNote}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {viewingDoc && (
        <AccommodationDocumentViewer
          document={viewingDoc}
          onClose={() => setViewing(null)}
          onVerdict={async (verified, verdictNote) => {
            const res = await verifyAccommodationDocument(viewingDoc.id, verified, verdictNote || undefined)
            if (!res.ok) {
              toast.error("That verdict didn't save", { description: res.error ?? undefined })
              return
            }
            toast.success(verified ? "Document verified" : "Document rejected")
            setViewing(null)
            refetchDocs()
          }}
        />
      )}

      {decision && (
        <DecisionSheet
          outcome={decision}
          note={note}
          setNote={setNote}
          busy={busy}
          onCancel={() => {
            setDecision(null)
            setNote("")
          }}
          onSubmit={() => runDecision(decision, note)}
        />
      )}
    </div>
  )
}

/**
 * The reason sheet.
 *
 * A DENIAL CANNOT BE SUBMITTED WITHOUT ONE, and that is asked for here rather
 * than discovered as an error. The database says the same thing —
 * `accommodation_requests_denial_note_ck`, and `note_required` from the RPC —
 * so this control cannot be the only thing standing between a manager and an
 * unreasoned denial, and it is not pretending to be.
 *
 * The blank test is `/\S/`, matching `public.text_present`. A note of "\n\n"
 * would otherwise pass here and be refused there.
 */
function DecisionSheet({
  outcome,
  note,
  setNote,
  busy,
  onCancel,
  onSubmit,
}: {
  outcome: "approved" | "denied" | "info_requested"
  note: string
  setNote: (v: string) => void
  busy: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  const needsNote = outcome === "denied"
  const hasNote = /\S/.test(note)
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onCancel}>
        <div
          className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-[17px] font-semibold text-foreground">
            {outcome === "denied" ? "Deny this request" : "Ask for more information"}
          </h3>
          <p className="mt-1 break-words text-[12px] leading-relaxed text-muted-foreground">
            {outcome === "denied"
              ? "The reasoning is what defends this decision. The resident will be able to read it."
              : "Say what is still needed. The resident will be able to read it."}
          </p>
          <label htmlFor="accom-decision-note" className="mt-3 mb-1 block text-[11px] font-semibold text-muted-foreground">
            {needsNote ? "Reason (required)" : "What is needed"}
          </label>
          <textarea
            id="accom-decision-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border bg-background p-2 text-[13px] text-foreground"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl bg-muted py-3 text-[15px] font-semibold text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={busy || (needsNote && !hasNote)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {outcome === "denied" ? "Deny" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
