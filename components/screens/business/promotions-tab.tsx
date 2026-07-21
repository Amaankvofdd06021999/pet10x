"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  useCampaigns,
  useTargetBuildings,
  createCampaign,
  setCampaignActive,
  deleteCampaign,
  CAMPAIGN_LABEL,
  type CampaignKind,
} from "@/lib/data/bookings"
import type { MyBusiness } from "@/lib/data/business"
import { SectionCard, Spinner, EmptyState, TextInput, Field } from "./business-ui"
import { Megaphone, Plus, Trash2, Loader2, Building2, Users, Dog, Cat } from "lucide-react"

const KINDS: CampaignKind[] = ["community_sponsored", "directory_featured", "banner"]

export function PromotionsTab({ business }: { business: MyBusiness }) {
  const { data: campaigns, isLoading, refetch } = useCampaigns(business.id)
  const { data: buildings } = useTargetBuildings()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<CampaignKind>("community_sponsored")
  const [buildingId, setBuildingId] = useState("")
  const [days, setDays] = useState("30")
  const [radiusKm, setRadiusKm] = useState("8")

  const nameFor = (id: string | null) => buildings.find((b) => b.id === id)?.name ?? "—"
  const target = buildings.find((b) => b.id === buildingId)

  async function create() {
    if (kind === "community_sponsored" && !buildingId) return toast.error("Pick a building to sponsor.")
    setBusy(true)
    const { error } = await createCampaign({
      businessId: business.id,
      kind,
      buildingId: kind === "community_sponsored" ? buildingId : null,
      latitude: kind !== "community_sponsored" ? business.latitude : null,
      longitude: kind !== "community_sponsored" ? business.longitude : null,
      radiusM: kind !== "community_sponsored" ? Math.round((parseFloat(radiusKm) || 8) * 1000) : null,
      days: parseInt(days, 10) || 30,
    })
    setBusy(false)
    if (error) return toast.error("Couldn't create campaign", { description: error })
    toast.success("Campaign is live")
    setCreating(false)
    refetch()
  }

  async function toggle(id: string, active: boolean) {
    const { error } = await setCampaignActive(id, active)
    if (error) return toast.error("Couldn't update", { description: error })
    toast.success(active ? "Campaign resumed" : "Campaign paused")
    refetch()
  }

  async function remove(id: string) {
    if (!confirm("Delete this campaign?")) return
    const { error } = await deleteCampaign(id)
    if (error) return toast.error("Couldn't delete", { description: error })
    toast.success("Campaign deleted")
    refetch()
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Campaigns"
        action={
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" /> {creating ? "Close" : "New campaign"}
          </button>
        }
      >
        <p className="mb-3 text-[12.5px] text-muted-foreground">
          Sponsor a specific building&apos;s community feed — an audience of verified, local pet owners.
        </p>

        {creating && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-background p-3.5">
            <Field label="Placement">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as CampaignKind)}
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground focus:border-accent focus:outline-none"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CAMPAIGN_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>

            {kind === "community_sponsored" ? (
              <Field label="Target building">
                <select
                  value={buildingId}
                  onChange={(e) => setBuildingId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="">Choose a building…</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.city ? ` · ${b.city}` : ""}
                    </option>
                  ))}
                </select>
                {/* Aggregate reach only — never a resident list */}
                {target && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-accent/10 px-3 py-2 text-[12.5px] text-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-accent" /> {target.petOwners} pet owners
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Dog className="h-3.5 w-3.5 text-accent" /> {target.dogs} dogs
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Cat className="h-3.5 w-3.5 text-accent" /> {target.cats} cats
                    </span>
                  </div>
                )}
              </Field>
            ) : (
              <Field label="Radius (km) around your location">
                <TextInput value={radiusKm} onChange={setRadiusKm} placeholder="8" />
              </Field>
            )}

            <Field label="Run for (days)">
              <TextInput value={days} onChange={setDays} placeholder="30" />
            </Field>

            <button
              onClick={create}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Launch campaign
            </button>
          </div>
        )}

        {isLoading ? (
          <Spinner />
        ) : campaigns.length === 0 ? (
          <EmptyState icon={<Megaphone className="h-8 w-8" />} title="No campaigns yet" sub="Sponsor a building to reach its pet owners." />
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  {c.buildingId ? <Building2 className="h-4 w-4 text-accent" /> : <Megaphone className="h-4 w-4 text-accent" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{CAMPAIGN_LABEL[c.kind]}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {c.buildingId ? nameFor(c.buildingId) : c.radiusM ? `${Math.round(c.radiusM / 1000)} km radius` : "Everywhere"}
                    {c.endsAt ? ` · until ${new Date(c.endsAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => toggle(c.id, !c.active)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold ${c.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                >
                  {c.active ? "Active" : "Paused"}
                </button>
                <button onClick={() => remove(c.id)} className="rounded-lg bg-muted p-2 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Reachable audience">
        <p className="mb-3 text-[12.5px] text-muted-foreground">
          Aggregate counts only — Pet10x never exposes resident identities to businesses.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Building</th>
                <th className="py-2 pr-3 text-right font-semibold">Pet owners</th>
                <th className="py-2 pr-3 text-right font-semibold">Dogs</th>
                <th className="py-2 text-right font-semibold">Cats</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((b) => (
                <tr key={b.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 font-medium text-foreground">
                    {b.name}
                    {b.city ? <span className="ml-1 text-[11px] text-muted-foreground">{b.city}</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{b.petOwners}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{b.dogs}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{b.cats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
