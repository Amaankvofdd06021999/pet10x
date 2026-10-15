"use client"

import { useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import {
  useBuildingResidents,
  useBuildingPets,
  computeComplianceGaps,
  approveResidentLink,
  denyResidentLink,
  removeResident,
} from "@/lib/data"
import { useComplianceInputs } from "@/lib/data/portfolio"
import { useManagerBuilding } from "@/lib/data/manager"
import { useBuildingScope } from "@/lib/data/use-building-scope"
import { ScopeNotice } from "@/components/screens/manager/scope-notice"
import { useAuth } from "@/lib/auth-context"
import { RequestInfoButton } from "@/components/screens/manager/request-info-button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { shortDate } from "@/lib/dates"
import type { ResidentLinkRow, ManagerPet } from "@/lib/data"
import { toast } from "sonner"
import { Search, Check, X, Clock, UserMinus, Loader2, Users, Dog, Cat, ChevronDown, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export function ManagerResidentsScreen() {
  const [search, setSearch] = useState("")
  const { data: allResidents, isLoading: residentsLoading, refetch } = useBuildingResidents()
  const { data: allPets } = useBuildingPets()
  const { data: allInputs } = useComplianceInputs()
  const { activeBuildingId } = useAuth()
  // Only the active building's people, and only their pets in it: someone who
  // lives in two of this manager's buildings is two rows, one per building.
  // Until the buildings are known the list waits (spinner) rather than
  // offering Approve and Remove on every building's residents.
  const { scope, loading: scopeLoading, showBuilding, activeName, notice, buildingName } = useBuildingScope()
  const residents = scope(allResidents)
  const buildingPets = scope(allPets)
  const complianceInputs = scope(allInputs)
  const isLoading = residentsLoading || scopeLoading
  const { data: building } = useManagerBuilding(activeBuildingId)
  const [busy, setBusy] = useState<string | null>(null)
  // Deny and remove each tell a person no, so each asks first (with room for
  // the reason they will read) instead of firing on the tap.
  const [confirming, setConfirming] = useState<{ kind: "deny" | "remove"; resident: ResidentLinkRow } | null>(null)
  // A dialog opened for one building's resident must not survive a switch to
  // another building, where that row is no longer on screen.
  const [scopedFor, setScopedFor] = useState(activeBuildingId)
  if (scopedFor !== activeBuildingId) {
    setScopedFor(activeBuildingId)
    setConfirming(null)
  }

  /**
   * What each resident still owes, from the same function their own card
   * reads — so the manager cannot see a different list to the resident, and
   * cannot ask for something this building does not require.
   */
  const gapsFor = (r: ResidentLinkRow) => {
    const theirPets = complianceInputs.filter((p) => p.ownerId === r.profileId)
    return computeComplianceGaps({
      phone: r.residentPhone,
      unitId: r.unit,
      hasBuilding: true,
      // Every resident in this list is in a building, so the address gap — which
      // only fires for standalone owners — can never apply here.
      hasAddress: true,
      rules: building?.rules ?? {},
      pets: theirPets.map((p) => ({
        id: p.petId,
        name: p.name,
        neutered: p.neutered,
        vaccinations: p.vax,
        documentKinds: p.docs.map((d) => d.kind),
        hasEmergencyContact: p.hasEmergencyContact,
      })),
    })
  }

  const match = (r: ResidentLinkRow) =>
    search === "" ||
    r.residentName.toLowerCase().includes(search.toLowerCase()) ||
    (r.residentEmail ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.unit ?? "").includes(search)

  const pending = residents.filter((r) => r.status === "pending" && match(r))
  const members = residents.filter((r) => r.status === "approved" && match(r))

  async function approve(linkId: string) {
    setBusy(linkId)
    const { error } = await approveResidentLink(linkId)
    setBusy(null)
    if (error) return toast.error("Couldn't approve", { description: error })
    toast.success("Resident approved")
    refetch()
  }

  /** The confirmed deny or remove. A failure stays in the dialog, beside the reason. */
  async function decide(reason: string | null): Promise<{ error: string | null }> {
    if (!confirming) return { error: null }
    const { kind, resident } = confirming
    setBusy(resident.linkId)
    const fn = kind === "deny" ? denyResidentLink : removeResident
    const { error } = await fn(resident.linkId, reason ?? undefined)
    setBusy(null)
    if (error) return { error }
    toast.success(kind === "deny" ? "Request denied" : "Removed from building")
    refetch()
    return { error: null }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Residents"
        subtitle={showBuilding ? activeName : null}
        largeTitle={false}
      />

      <div className="sticky top-16 z-30 bg-background px-4 pb-2">
        <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search resident, email, or unit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-body text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-24 pt-2">
        <ScopeNotice notice={notice} className="mb-3" />
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Pending requests */}
            <section className="mb-6">
              <div className="mb-2.5 flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                <h2 className="text-body font-semibold text-foreground">Pending requests</h2>
                <Badge variant="warning">{pending.length}</Badge>
              </div>
              {pending.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-meta text-muted-foreground">
                  No pending requests
                </div>
              ) : (
                <div className="grid gap-2.5 lg:grid-cols-2">
                  {pending.map((r) => {
                    const gaps = gapsFor(r)
                    return (
                    <div key={r.linkId} className="rounded-xl border border-warning bg-warning-soft p-3.5">
                      <p className="text-body font-semibold text-foreground">{r.residentName}</p>
                      {showBuilding && buildingName(r.buildingId) && (
                        <p className="text-caption font-semibold text-muted-foreground">{buildingName(r.buildingId)}</p>
                      )}
                      <p className="text-caption text-muted-foreground">{r.residentEmail || "—"}</p>
                      <p className="text-caption text-muted-foreground">
                        Unit {r.unit ?? "not given"} · requested {shortDate(r.requestedAt)}
                      </p>

                      {/* What this request is still missing, so the decision to
                          approve is made with the gaps visible rather than
                          discovered afterwards. */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {gaps.length === 0 ? (
                          <Badge variant="success">All details provided</Badge>
                        ) : (
                          <>
                            {gaps.slice(0, 3).map((g) => (
                              <Badge key={`${g.id}:${g.petId ?? "self"}`} variant="neutral">
                                {g.label}
                              </Badge>
                            ))}
                            {gaps.length > 3 && (
                              <span className="text-caption text-muted-foreground">+{gaps.length - 3}</span>
                            )}
                          </>
                        )}
                        <span className="ml-auto">
                          <RequestInfoButton
                            resident={r}
                            missing={gaps.map((g) => (g.petName ? `${g.label} (${g.petName})` : g.label))}
                            onDone={refetch}
                          />
                        </span>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <Button
                          className="flex-1"
                          size="sm"
                          onClick={() => approve(r.linkId)}
                          disabled={busy === r.linkId}
                          loading={busy === r.linkId}
                        >
                          {busy !== r.linkId && <Check className="h-3.5 w-3.5" />} Approve
                        </Button>
                        <Button
                          className="flex-1"
                          size="sm"
                          variant="secondary"
                          onClick={() => setConfirming({ kind: "deny", resident: r })}
                          disabled={busy === r.linkId}
                        >
                          <X className="h-3.5 w-3.5 text-destructive" /> Deny
                        </Button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Members */}
            <section>
              <div className="mb-2.5 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h2 className="text-body font-semibold text-foreground">Members</h2>
                <Badge variant="brand">{members.length}</Badge>
              </div>
              {members.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-meta text-muted-foreground">
                  No members yet
                </div>
              ) : (
                <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
                  {members.map((r) => (
                    <MemberCard
                      key={r.linkId}
                      member={r}
                      pets={buildingPets.filter((p) => p.ownerId === r.profileId)}
                      buildingName={showBuilding ? buildingName(r.buildingId) : null}
                      busy={busy === r.linkId}
                      onRemove={() => setConfirming({ kind: "remove", resident: r })}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title={confirming ? confirmTitle(confirming.kind, confirming.resident, building?.name) : ""}
        description={
          confirming?.kind === "remove"
            ? "They lose access and must ask to rejoin."
            : "They're told the request wasn't approved, and can ask again."
        }
        confirmLabel={confirming?.kind === "remove" ? "Remove from building" : "Deny request"}
        tone="danger"
        reason={{ label: "Reason (the resident reads this)", required: false }}
        onConfirm={decide}
      />
    </div>
  )
}

/** "Remove Ana (Unit 4B) from Maple Court?" — who, where, so the wrong row is caught here. */
function confirmTitle(kind: "deny" | "remove", r: ResidentLinkRow, buildingName: string | undefined) {
  const who = r.unit ? `${r.residentName} (Unit ${r.unit})` : r.residentName
  if (kind === "deny") return `Deny ${who}'s request to join?`
  return `Remove ${who} from ${buildingName ?? "this building"}?`
}

function MemberCard({
  member,
  pets,
  busy,
  onRemove,
  buildingName,
}: {
  member: ResidentLinkRow
  pets: ManagerPet[]
  /** Set only for a manager of more than one building. */
  buildingName: string | null
  busy: boolean
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl card-raised">
      <div className="flex items-center gap-3 p-3.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-meta font-bold text-foreground"
        >
          {member.unit || member.residentName.slice(0, 1).toUpperCase()}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-body font-semibold text-foreground">{member.residentName}</p>
          <p className="truncate text-caption text-muted-foreground">
            {pets.length} pet{pets.length === 1 ? "" : "s"} · {member.residentEmail || "—"}
          </p>
          {buildingName && <p className="truncate text-caption font-semibold text-muted-foreground">{buildingName}</p>}
        </button>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="border-t border-border p-3">
          {pets.length === 0 ? (
            <p className="text-caption text-muted-foreground">No pets registered.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pets.map((p) => {
                const Icon = p.species === "dog" ? Dog : Cat
                // The words stay dark; the shield carries how compliant the pet is.
                const color =
                  p.compliancePct >= 100 ? "text-success" : p.compliancePct >= 50 ? "text-warning" : "text-destructive"
                return (
                  <div key={p.id} className="flex items-center gap-2.5 rounded-lg bg-muted p-2.5">
                    <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-meta font-semibold text-foreground">{p.name}</p>
                      <p className="truncate text-caption text-muted-foreground">
                        {p.breed || "Pet"}
                        {p.missing.length ? ` · missing: ${p.missing.join(", ")}` : ""}
                      </p>
                    </div>
                    <span className="flex flex-shrink-0 items-center gap-1 text-caption font-semibold text-foreground">
                      <Shield className={`h-3.5 w-3.5 ${color}`} />
                      {p.compliancePct}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          {/* In the expanded panel, labelled, rather than an icon beside the
              chevron where a tap meant for "open" could land on it. */}
          <Button className="mt-3" variant="secondary" onClick={onRemove} loading={busy}>
            {!busy && <UserMinus className="h-4 w-4 text-destructive" />}
            Remove from building
          </Button>
        </div>
      )}
    </div>
  )
}
