"use client"

import { useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { useBuildingResidents, useBuildingPets, approveResidentLink, denyResidentLink, removeResident } from "@/lib/data"
import type { ResidentLinkRow, ManagerPet } from "@/lib/data"
import { toast } from "sonner"
import { Search, Check, X, Clock, UserMinus, Loader2, Users, Dog, Cat, ChevronDown, Shield } from "lucide-react"

export function ManagerResidentsScreen() {
  const [search, setSearch] = useState("")
  const { data: residents, isLoading, refetch } = useBuildingResidents()
  const { data: buildingPets } = useBuildingPets()
  const [busy, setBusy] = useState<string | null>(null)

  const match = (r: ResidentLinkRow) =>
    search === "" ||
    r.residentName.toLowerCase().includes(search.toLowerCase()) ||
    (r.residentEmail ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.unit ?? "").includes(search)

  const pending = residents.filter((r) => r.status === "pending" && match(r))
  const members = residents.filter((r) => r.status === "approved" && match(r))

  async function act(linkId: string, fn: (id: string) => Promise<{ error: string | null }>, ok: string) {
    setBusy(linkId)
    const { error } = await fn(linkId)
    setBusy(null)
    if (error) return toast.error("Action failed", { description: error })
    toast.success(ok)
    refetch()
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar title="Residents" />

      <div className="sticky top-[88px] z-30 bg-background px-4 pb-2">
        <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search resident, email, or unit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-24 pt-2">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Pending requests */}
            <section className="mb-6">
              <div className="mb-2.5 flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#B8860B]" />
                <h2 className="text-[15px] font-semibold text-foreground">Pending requests</h2>
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-[#B8860B]">{pending.length}</span>
              </div>
              {pending.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-[13px] text-muted-foreground">
                  No pending requests
                </div>
              ) : (
                <div className="grid gap-2.5 lg:grid-cols-2">
                  {pending.map((r) => (
                    <div key={r.linkId} className="rounded-xl border border-warning/30 bg-[#FFFBEF] p-3.5">
                      <p className="text-[15px] font-semibold text-foreground">{r.residentName}</p>
                      <p className="text-[12px] text-muted-foreground">{r.residentEmail || "—"}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => act(r.linkId, approveResidentLink, "Resident approved")}
                          disabled={busy === r.linkId}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success py-2 text-[13px] font-semibold text-success-foreground transition-transform active:scale-[0.97] disabled:opacity-60"
                        >
                          {busy === r.linkId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                        </button>
                        <button
                          onClick={() => act(r.linkId, denyResidentLink, "Request denied")}
                          disabled={busy === r.linkId}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-2 text-[13px] font-semibold text-foreground transition-transform active:scale-[0.97] disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" /> Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Members */}
            <section>
              <div className="mb-2.5 flex items-center gap-2">
                <Users className="h-4 w-4 text-info" />
                <h2 className="text-[15px] font-semibold text-foreground">Members</h2>
                <span className="rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-semibold text-info">{members.length}</span>
              </div>
              {members.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-[13px] text-muted-foreground">
                  No members yet
                </div>
              ) : (
                <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
                  {members.map((r) => (
                    <MemberCard
                      key={r.linkId}
                      member={r}
                      pets={buildingPets.filter((p) => p.ownerId === r.profileId)}
                      busy={busy === r.linkId}
                      onRemove={() => act(r.linkId, removeResident, "Resident removed")}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function MemberCard({
  member,
  pets,
  busy,
  onRemove,
}: {
  member: ResidentLinkRow
  pets: ManagerPet[]
  busy: boolean
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 p-3.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-[13px] font-bold text-foreground"
        >
          {member.unit || member.residentName.slice(0, 1).toUpperCase()}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[14px] font-semibold text-foreground">{member.residentName}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {pets.length} pet{pets.length === 1 ? "" : "s"} · {member.residentEmail || "—"}
          </p>
        </button>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        <button
          onClick={onRemove}
          disabled={busy}
          aria-label="Remove resident"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-destructive transition-colors active:bg-destructive/10 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-border p-3">
          {pets.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No pets registered.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pets.map((p) => {
                const Icon = p.species === "dog" ? Dog : Cat
                const color =
                  p.compliancePct >= 100 ? "text-success" : p.compliancePct >= 50 ? "text-[#B8860B]" : "text-destructive"
                return (
                  <div key={p.id} className="flex items-center gap-2.5 rounded-lg bg-muted/40 p-2.5">
                    <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-foreground">{p.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {p.breed || "Pet"}
                        {p.missing.length ? ` · missing: ${p.missing.join(", ")}` : ""}
                      </p>
                    </div>
                    <span className={`flex flex-shrink-0 items-center gap-1 text-[12px] font-semibold ${color}`}>
                      <Shield className="h-3.5 w-3.5" />
                      {p.compliancePct}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
