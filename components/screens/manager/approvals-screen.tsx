"use client"

import { useState, type ReactNode } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
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
import { PetDocumentReviewControls } from "@/components/screens/manager/pet-document-review"
import { SpeciesIcon } from "@/components/screens/shared/species-icon"
import { Spinner } from "@/components/ui/spinner"
import { LoadError } from "@/components/ui/load-error"
import { EmptyState } from "@/components/ui/empty"
import { approvalsState, defaultApprovalsTab, refreshFailed, type ApprovalsTabId } from "@/lib/data/approvals-view"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useBuildingScope } from "@/lib/data/use-building-scope"
import { ScopeNotice } from "@/components/screens/manager/scope-notice"
import { toast } from "sonner"
import {
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Scale,
  Heart,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { DialogDescription, DialogLayer, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type ApprovalTab = ApprovalsTabId

/** A row's building, as a small line under its title; only for a manager of more than one. */
function BuildingLine({ name }: { name: string | null }) {
  if (!name) return null
  return <p className="truncate text-caption font-semibold text-muted-foreground">{name}</p>
}

/**
 * One tab's body: a spinner while loading, an error with Try again when the
 * query failed, the empty state only after a clean empty load, else the rows.
 * "Nothing pending" used to show in all three of the first states.
 */
function TabBody<T>({
  q,
  onRetry,
  empty,
  children,
}: {
  q: { data: T[]; isLoading: boolean; error: string | null }
  onRetry: () => void
  empty: ReactNode
  children: (rows: T[]) => ReactNode
}) {
  switch (approvalsState(q)) {
    case "loading":
      return <Spinner />
    case "error":
      return <LoadError message={q.error ?? "Something went wrong."} onRetry={onRetry} />
    case "empty":
      return <>{empty}</>
    case "ready":
      return (
        <>
          {refreshFailed(q) && (
            <p className="mb-2 text-caption text-muted-foreground" role="status">
              Couldn&apos;t refresh. Showing what loaded last.
            </p>
          )}
          {children(q.data)}
        </>
      )
  }
}

export function ManagerApprovalsScreen({
  onNavigate,
  initialTab,
}: {
  onNavigate?: (screen: string) => void
  /** Opens on this tab instead of the one that needs a decision first. */
  initialTab?: ApprovalTab
} = {}) {
  // null until the manager taps a tab: until then the screen opens on whatever
  // needs a decision, once every list has loaded to say what that is.
  const [pickedTab, setPickedTab] = useState<ApprovalTab | null>(null)
  const [expandedReg, setExpandedReg] = useState<string | null>(null)
  const [expandedAcc, setExpandedAcc] = useState<string | null>(null)
  // Every list is the active building's, scoped BEFORE anything is counted,
  // so a tab's count and the list under it are always the same rows.
  // Each also reads as loading until the buildings are known, so the tabs
  // show their spinner rather than every building's rows with live buttons.
  const { activeBuildingId, scopeQuery, showBuilding, activeName, notice, buildingName } = useBuildingScope()
  const labelFor = (id: string | null, joined?: string | null) => (showBuilding ? buildingName(id, joined) : null)
  const regsQ = scopeQuery(useRegistrationsLive())
  const accQ = scopeQuery(useAccommodationsLive())
  const docsQ = scopeQuery(useDocumentsReview())
  const incQ = scopeQuery(useIncidents())
  const { data: registrations, refetch: refetchRegs } = regsQ
  const { data: accommodations, refetch: refetchAcc } = accQ
  const { data: documentsReview, refetch: refetchDocs } = docsQ
  const { data: incidents, refetch: refetchIncidents } = incQ
  // The registration whose decision is in flight, so its buttons cannot be
  // pressed twice — a second press would only earn "already decided".
  const [regBusy, setRegBusy] = useState<string | null>(null)
  // The registration the deny dialog is open for.
  const [denying, setDenying] = useState<{ id: string; name: string } | null>(null)
  // Switching building swaps every list, so a dialog or an expanded card for a
  // row that just left the screen is closed with it. The tab the manager
  // picked is kept.
  const [scopedFor, setScopedFor] = useState(activeBuildingId)
  if (scopedFor !== activeBuildingId) {
    setScopedFor(activeBuildingId)
    setDenying(null)
    setExpandedReg(null)
    setExpandedAcc(null)
  }

  async function approveRegistration(id: string, name: string) {
    setRegBusy(id)
    const { error } = await decideRegistration(id, true)
    setRegBusy(null)
    if (error) return toast.error("Couldn't approve", { description: error })
    toast.success(`${name} approved`)
    refetchRegs()
  }

  // The Incidents tab is the open ones — what needs a decision — so its count
  // and its list are the same rows. History lives in Incident reports.
  const openIncidents = incidents.filter((i) => isOpenIncident(i.status))
  const incidentsView = { ...incQ, data: openIncidents }
  const allLoaded = !(regsQ.isLoading || accQ.isLoading || docsQ.isLoading || incQ.isLoading)
  // Chosen ONCE, the first time every list has loaded. Re-deriving it on each
  // render would move the manager off the tab they are working in whenever a
  // refetch changes which list is first non-empty (approving the last
  // registration, say).
  //
  // Latched per building: switching the active building is a different set of
  // lists, so the choice is made again from that building's counts.
  const [latched, setLatched] = useState<{ buildingId: string | null; tab: ApprovalTab } | null>(null)
  if (allLoaded && (latched === null || latched.buildingId !== activeBuildingId)) {
    setLatched({
      buildingId: activeBuildingId,
      tab: defaultApprovalsTab({
        registrations: registrations.length,
        documents: documentsReview.length,
        accommodations: accommodations.length,
        incidents: openIncidents.length,
      }),
    })
  }
  const latchedTab = latched?.buildingId === activeBuildingId ? latched.tab : null
  const activeTab: ApprovalTab = pickedTab ?? initialTab ?? latchedTab ?? "registrations"
  const setActiveTab = setPickedTab
  // Every count is derived. These were hardcoded 3 / 2 / 4 while the lists
  // beneath them came from live queries, so a tab could advertise rows that
  // did not exist — and did, on every empty building.
  const TABS: { id: ApprovalTab; label: string; count: number }[] = [
    { id: "registrations", label: "Registrations", count: registrations.length },
    { id: "documents", label: "Documents", count: documentsReview.length },
    { id: "accommodations", label: "Accommodations", count: accommodations.length },
    { id: "incidents", label: "Incidents", count: openIncidents.length },
  ]
  // A count is only a count once its list has loaded; "(0)" beside a tab that
  // is still loading, or failed, would say there is nothing there.
  const tabReady: Record<ApprovalTab, boolean> = {
    registrations: approvalsState(regsQ) !== "loading" && approvalsState(regsQ) !== "error",
    documents: approvalsState(docsQ) !== "loading" && approvalsState(docsQ) !== "error",
    accommodations: approvalsState(accQ) !== "loading" && approvalsState(accQ) !== "error",
    incidents: approvalsState(incQ) !== "loading" && approvalsState(incQ) !== "error",
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Approvals"
        subtitle={showBuilding ? activeName : null}
        largeTitle={false}
      />

      {/* Tabs */}
      <div className="sticky top-16 z-30 bg-background px-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3 py-1.5 text-caption font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {tab.label}
              <span className="ml-1 opacity-70">({tabReady[tab.id] ? tab.count : "…"})</span>
            </button>
          ))}
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-24">
        <ScopeNotice notice={notice} className="mb-3" />
        {/* Incidents — where guest and resident reports land for triage. */}
        {activeTab === "incidents" && (
          <TabBody
            q={incidentsView}
            onRetry={refetchIncidents}
            empty={
              <EmptyState
                title="No open incidents"
                detail="History is in Incident reports."
                action={
                  onNavigate && (
                    <Button variant="link" size="sm" onClick={() => onNavigate("incidents")}>
                      Incident reports
                    </Button>
                  )
                }
              />
            }
          >
            {(rows) => (
              <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
                {rows.map((incident) => (
                  <IncidentCard
                    key={incident.id}
                    incident={incident}
                    onChange={refetchIncidents}
                    buildingName={labelFor(incident.buildingId, incident.buildingName)}
                  />
                ))}
              </div>
            )}
          </TabBody>
        )}

        {/* Registrations Tab */}
        {activeTab === "registrations" && (
          <TabBody
            q={regsQ}
            onRetry={refetchRegs}
            empty={
              <EmptyState
                title="No registrations waiting"
                detail="New pet registrations from residents will appear here."
              />
            }
          >
            {(rows) => (
          <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
            {rows.map((reg) => {
              const isOpen = expandedReg === reg.id
              return (
                <div key={reg.id} className="rounded-xl card-raised overflow-hidden">
                  <button
                    onClick={() => setExpandedReg(isOpen ? null : reg.id)}
                    className="flex w-full items-center gap-3 p-3 text-left active:bg-muted"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft">
                      <SpeciesIcon species={reg.species} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-semibold text-foreground">{reg.name} — Unit {reg.unit}</p>
                      <BuildingLine name={labelFor(reg.buildingId)} />
                      <p className="text-caption text-muted-foreground">{reg.breed} &middot; {reg.weight} &middot; {reg.age}</p>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border bg-muted px-3 pb-3 pt-2.5">
                      <p className="text-caption text-muted-foreground mb-2">Submitted by {reg.resident} on {reg.submitted}</p>

                      {/* Flags */}
                      {reg.flags.length > 0 && (
                        <div className="mb-3 flex flex-col gap-1.5">
                          {reg.flags.map((flag, i) => (
                            <div key={i} className="flex items-start gap-2 rounded-lg bg-warning-soft border border-warning p-2">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-warning" />
                              <span className="text-caption text-foreground">{flag}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Document Checklist */}
                      <p className="mb-1.5 text-caption font-semibold uppercase text-muted-foreground">Documents</p>
                      <div className="flex flex-col gap-1 mb-3">
                        {Object.entries(reg.documents).map(([key, ok]) => (
                          <div key={key} className="flex items-center gap-2">
                            {ok ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive" />
                            )}
                            <span className="text-caption text-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          size="sm"
                          onClick={() => approveRegistration(reg.id, reg.name)}
                          disabled={regBusy === reg.id}
                        >
                          Approve
                        </Button>
                        {/* A deny needs a reason the owner reads — the function
                            refuses one without (20261015000001) — so it asks
                            first instead of firing on the tap. */}
                        <Button
                          className="flex-1"
                          size="sm"
                          variant="secondary"
                          onClick={() => setDenying({ id: reg.id, name: reg.name })}
                          disabled={regBusy === reg.id}
                        >
                          <XCircle className="h-3.5 w-3.5 text-destructive" /> Deny
                        </Button>
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
          </TabBody>
        )}

        <ConfirmDialog
          open={denying !== null}
          onOpenChange={(open) => {
            if (!open) setDenying(null)
          }}
          title={`Deny ${denying?.name ?? "this pet"}'s registration?`}
          description="The owner is told it wasn't approved, with your reason, and can apply again."
          confirmLabel="Deny registration"
          tone="danger"
          reason={{ label: "Reason (the owner reads this)", required: true }}
          onConfirm={async (reason) => {
            if (!denying) return { error: null }
            const { id, name } = denying
            setRegBusy(id)
            const { error } = await decideRegistration(id, false, reason ?? undefined)
            setRegBusy(null)
            if (error) return { error }
            toast(`${name} denied`)
            refetchRegs()
            return { error: null }
          }}
        />

        {/* Accommodations Tab — every control reaches the database, and every
            state shown is derived from a row that exists. See AccommodationsTab. */}
        {/* Keyed on the building: the open card (and any decision sheet in it)
            lives inside the tab, so a building switch remounts it closed. */}
        {activeTab === "accommodations" && (
          <AccommodationsTab key={activeBuildingId ?? "all"} q={accQ} refetch={refetchAcc} labelFor={labelFor} />
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <TabBody
            q={docsQ}
            onRetry={refetchDocs}
            empty={
              <EmptyState
                title="No documents waiting"
                detail="New uploads and expiring records will show up here."
              />
            }
          >
            {(rows) => (
          <div className="flex flex-col gap-2.5">
            {/* Expiring Soon Header */}
            <div className="mb-1">
              <p className="text-caption font-semibold text-muted-foreground">
                Documents awaiting your verdict — approved or rejected ones leave this list
              </p>
            </div>
            {rows.map((doc) => (
              <div key={doc.id} className="flex flex-col gap-2.5 rounded-xl card-raised p-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                    doc.status === "expiring" ? "bg-warning-soft" : "bg-info-soft"
                  }`}>
                    {doc.status === "expiring" ? (
                      <Clock className="h-4 w-4 text-warning" />
                    ) : (
                      <Shield className="h-4 w-4 text-info" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-meta font-semibold text-foreground">{doc.type}</p>
                    <p className="text-caption text-muted-foreground">{doc.pet} &middot; Unit {doc.unit}</p>
                    <BuildingLine name={labelFor(doc.buildingId)} />
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge variant={doc.status === "expiring" ? "warning" : "info"}>
                      {doc.status === "expiring" ? "Expiring" : "To review"}
                    </Badge>
                    <p className="mt-0.5 text-caption text-muted-foreground">{doc.expiring}</p>
                  </div>
                </div>
                <PetDocumentReviewControls doc={doc} onDone={refetchDocs} />
              </div>
            ))}
          </div>
            )}
          </TabBody>
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
  q,
  refetch,
  labelFor,
}: {
  q: { data: AccommodationRequestView[]; isLoading: boolean; error: string | null }
  refetch: () => void
  labelFor: (buildingId: string | null) => string | null
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <TabBody
      q={q}
      onRetry={refetch}
      empty={
        <EmptyState
          title="No accommodation requests waiting"
          detail="ESA and service animal requests will appear here for review."
        />
      }
    >
      {(requests) => (
        <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
          {requests.map((req) => (
            <AccommodationCard
              key={req.id}
              request={req}
              isOpen={expanded === req.id}
              onToggle={() => setExpanded(expanded === req.id ? null : req.id)}
              refetch={refetch}
              buildingName={labelFor(req.buildingId)}
            />
          ))}
        </div>
      )}
    </TabBody>
  )
}

// The words stay dark; the icon beside each line carries the state's colour.
const CHECK_TONE: Record<ChecklistItem["state"], string> = {
  verified: "text-foreground",
  provided: "text-foreground",
  rejected: "text-foreground",
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
  buildingName,
}: {
  request: AccommodationRequestView
  isOpen: boolean
  onToggle: () => void
  refetch: () => void
  buildingName: string | null
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
        className="flex w-full items-center gap-3 p-3 text-left active:bg-muted"
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft">
          {request.type === "esa" ? <Heart className="h-5 w-5 text-primary" /> : <Shield className="h-5 w-5 text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-body font-semibold text-foreground break-words">
              {ACCOMMODATION_TYPE_LABEL[request.type]}
            </p>
            <Badge variant="brand">{STATUS_LABEL[request.status]}</Badge>
          </div>
          <p className="text-caption text-muted-foreground break-words">
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
          <BuildingLine name={buildingName} />
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-border bg-muted px-3 pb-3 pt-2.5">
          <p className="mb-2 text-caption text-muted-foreground break-words">
            {request.residentName}
            {request.submittedAt ? ` · submitted ${shortDate(request.submittedAt)}` : ""}
            {request.withdrawnAt ? ` · withdrawn ${shortDate(request.withdrawnAt)}` : ""}
          </p>

          {request.animalDesc && (
            <div className="mb-3 rounded-lg border border-border bg-background p-2.5">
              <p className="text-caption font-semibold uppercase text-muted-foreground">In the resident&apos;s words</p>
              {/* break-words, not pre-wrap alone. `whitespace-pre-wrap` wraps at
                  spaces only, and Phase 6 clipped 3526px of a resident's text
                  out of view because the clipping ancestor is overflow-x:auto. */}
              <p className="mt-1 whitespace-pre-wrap break-words text-caption leading-relaxed text-foreground">
                {request.animalDesc}
              </p>
            </div>
          )}

          {request.legalNote && (
            <div className="mb-3 rounded-lg border border-primary bg-primary-soft p-2.5">
              <div className="flex items-start gap-2">
                <Scale className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-caption font-semibold text-foreground">Guidance (the resident can read this)</p>
                  <p className="mt-0.5 break-words text-caption leading-relaxed text-foreground">{request.legalNote}</p>
                </div>
              </div>
            </div>
          )}

          <p className="mb-1.5 text-caption font-semibold uppercase text-muted-foreground">Documentation</p>
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
                      <p className="break-words text-caption font-medium text-foreground">
                        {item.label}
                        {item.required ? "" : " (optional)"}
                      </p>
                      <p className={`text-caption ${CHECK_TONE[item.state]}`}>
                        {item.kind === "animal_desc" ? DESC_WORD[item.state] : CHECK_WORD[item.state]}
                      </p>
                      {doc && (
                        <p className="mt-0.5 break-words text-caption text-muted-foreground">
                          {doc.label ?? "Untitled"} &middot; {fileSize(doc.sizeBytes)}
                          {doc.uploadedAt ? ` · ${shortDate(doc.uploadedAt)}` : ""}
                        </p>
                      )}
                    </div>
                    {doc && doc.storagePath && (
                      <Button size="sm" variant="secondary" className="flex-shrink-0" onClick={() => setViewing(doc.id)}>
                        Open
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {isOpenRequest ? (
            <>
              {!readyToApprove && (
                <p className="mb-2 break-words text-caption text-muted-foreground">
                  {missing.length > 0
                    ? `Approve is unavailable until this is provided: ${missing.join(", ")}.`
                    : "Approve is unavailable until every required document is verified. Open each one and record a verdict."}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  className="flex-1"
                  size="sm"
                  disabled={!readyToApprove || busy}
                  onClick={() => runDecision("approved", "")}
                >
                  Approve
                </Button>
                <Button
                  className="flex-1"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setDecision("denied")}
                >
                  <XCircle className="h-3.5 w-3.5 text-destructive" /> Deny
                </Button>
                {/* Was "Verify Docs". It never verified anything — it set
                    info_requested. Renamed to what it does, and it now carries
                    the note that makes "we need more" actionable. */}
                <Button
                  className="flex-1"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setDecision("info_requested")}
                >
                  Request more information
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-border bg-background p-2.5">
              <p className="text-caption font-semibold text-muted-foreground">
                {STATUS_LABEL[request.status]}
                {request.decidedAt ? ` · ${shortDate(request.decidedAt)}` : ""}
              </p>
              {request.decisionNote && (
                <p className="mt-1 whitespace-pre-wrap break-words text-caption text-foreground">
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
    // Escape and a tap outside cancel it — not while the decision is saving.
    <DialogLayer
      open
      onOpenChange={(next) => {
        if (!next && !busy) onCancel()
      }}
      described
      overlayClassName="flex items-end justify-center bg-black/50 sm:items-center"
      className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl"
    >
          <DialogTitle className="text-title font-semibold leading-normal text-foreground">
            {outcome === "denied" ? "Deny this request" : "Ask for more information"}
          </DialogTitle>
          <DialogDescription className="mt-1 break-words text-caption leading-relaxed text-muted-foreground">
            {outcome === "denied"
              ? "The reasoning is what defends this decision. The resident will be able to read it."
              : "Say what is still needed. The resident will be able to read it."}
          </DialogDescription>
          <label htmlFor="accom-decision-note" className="mt-3 mb-1 block text-caption font-semibold text-muted-foreground">
            {needsNote ? "Reason (required)" : "What is needed"}
          </label>
          <Textarea
            id="accom-decision-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
          />
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={onSubmit} disabled={needsNote && !hasNote} loading={busy}>
              {outcome === "denied" ? "Deny" : "Send"}
            </Button>
          </div>
    </DialogLayer>
  )
}
