"use client"

import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/select"
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
import { campaignLaunchBlock } from "@/lib/data/campaign-launch"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SectionCard } from "@/components/ui/section-card"
import { Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty"
import { TextInput, Field } from "./business-ui"
import { Megaphone, Plus, Trash2, Building2, Users, Dog, Cat } from "lucide-react"

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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Why Launch is disabled, or null when it isn't.
  const launchBlock = campaignLaunchBlock(business)

  const nameFor = (id: string | null) => buildings.find((b) => b.id === id)?.name ?? "—"
  const target = buildings.find((b) => b.id === buildingId)

  async function create() {
    if (launchBlock) return
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

  /* The dialog keeps a failure on screen, so only success toasts. */
  async function remove(id: string): Promise<{ error: string | null }> {
    const { error } = await deleteCampaign(id)
    if (error) return { error: "Couldn't delete the campaign. Try again." }
    toast.success("Campaign deleted")
    refetch()
    return { error: null }
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Campaigns"
        actions={
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> {creating ? "Close" : "New campaign"}
          </Button>
        }
      >
        <p className="mb-3 text-caption text-muted-foreground">
          Sponsor a specific building&apos;s community feed — an audience of verified, local pet owners.
        </p>

        {creating && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-background p-3.5">
            <Field label="Placement">
              <NativeSelect
                value={kind}
                onChange={(e) => setKind(e.target.value as CampaignKind)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CAMPAIGN_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            {kind === "community_sponsored" ? (
              <Field label="Target building">
                <NativeSelect
                  value={buildingId}
                  onChange={(e) => setBuildingId(e.target.value)}
                >
                  <option value="">Choose a building…</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.city ? ` · ${b.city}` : ""}
                    </option>
                  ))}
                </NativeSelect>
                {/* Aggregate reach only — never a resident list */}
                {target && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-primary-soft px-3 py-2 text-caption text-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-primary" /> {target.petOwners} pet owners
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Dog className="h-3.5 w-3.5 text-primary" /> {target.dogs} dogs
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Cat className="h-3.5 w-3.5 text-primary" /> {target.cats} cats
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

            {/* Said before the button, so nobody wonders what launching costs. */}
            <p className="text-caption font-semibold text-foreground">Free during beta</p>
            <Button
              onClick={create}
              loading={busy}
              disabled={launchBlock !== null}
              aria-describedby={launchBlock ? "launch-block" : undefined}
            >
              Launch campaign
            </Button>
            {launchBlock && (
              <p id="launch-block" className="-mt-1 text-center text-caption text-muted-foreground">
                {launchBlock}
              </p>
            )}
          </div>
        )}

        {isLoading ? (
          <Spinner />
        ) : campaigns.length === 0 ? (
          <EmptyState icon={<Megaphone className="h-8 w-8" />} title="No campaigns yet" detail="Sponsor a building to reach its pet owners." />
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft">
                  {c.buildingId ? <Building2 className="h-4 w-4 text-primary" /> : <Megaphone className="h-4 w-4 text-primary" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-meta font-semibold text-foreground">{CAMPAIGN_LABEL[c.kind]}</p>
                  <p className="truncate text-caption text-muted-foreground">
                    {c.buildingId ? nameFor(c.buildingId) : c.radiusM ? `${Math.round(c.radiusM / 1000)} km radius` : "Everywhere"}
                    {c.endsAt ? ` · until ${new Date(c.endsAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => toggle(c.id, !c.active)}>
                  <span aria-hidden="true" className={`size-2 rounded-full ${c.active ? "bg-success" : "bg-muted-foreground"}`} />
                  {c.active ? "Active" : "Paused"}
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => setDeletingId(c.id)}
                  aria-label={`Delete ${CAMPAIGN_LABEL[c.kind]} campaign`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Delete this campaign?"
        description="It stops showing to residents straight away. This can't be undone — to stop it for now, pause it instead."
        confirmLabel="Delete campaign"
        tone="danger"
        onConfirm={() => (deletingId ? remove(deletingId) : Promise.resolve({ error: null }))}
      />

      <SectionCard title="Reachable audience">
        <p className="mb-3 text-caption text-muted-foreground">
          Aggregate counts only — Pet10x never exposes resident identities to businesses.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-meta">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Building</th>
                <th className="py-2 pr-3 text-right font-semibold">Pet owners</th>
                <th className="py-2 pr-3 text-right font-semibold">Dogs</th>
                <th className="py-2 text-right font-semibold">Cats</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 font-medium text-foreground">
                    {b.name}
                    {b.city ? <span className="ml-1 text-caption text-muted-foreground">{b.city}</span> : null}
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
