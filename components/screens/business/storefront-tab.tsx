"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  updateBusiness,
  isOpenNow,
  DAY_KEYS,
  DAY_LABEL,
  type MyBusiness,
  type BusinessHours,
} from "@/lib/data/business"
import {
  useBusinessServices,
  createService,
  updateService,
  deleteService,
  type ServiceItem,
} from "@/lib/data/bookings"
import { SectionCard, TextInput, Field, Spinner, Stars } from "./business-ui"
import { Loader2, Navigation, Plus, Trash2, Store, MapPin, Star, Eye } from "lucide-react"

const CATEGORIES = ["Veterinary", "Grooming", "Boarding", "Dog walking", "Training", "Pet store", "Other"]

export function StorefrontTab({ business, onSaved }: { business: MyBusiness; onSaved: () => void }) {
  const { data: services, isLoading: svcLoading, refetch: refetchServices } = useBusinessServices(business.id)
  const [saving, setSaving] = useState(false)
  const [gps, setGps] = useState(false)

  const [f, setF] = useState({
    name: business.name,
    category: business.category,
    description: business.description ?? "",
    priceRange: business.priceRange ?? "",
    latitude: business.latitude != null ? String(business.latitude) : "",
    longitude: business.longitude != null ? String(business.longitude) : "",
    radiusKm: business.serviceRadiusM ? String(Math.round(business.serviceRadiusM / 1000)) : "",
    tags: business.tags.join(", "),
  })
  const [hours, setHours] = useState<BusinessHours>(
    business.hours ?? Object.fromEntries(DAY_KEYS.map((d) => [d, { open: "09:00", close: "17:00" }])),
  )

  async function save() {
    setSaving(true)
    const lat = f.latitude ? parseFloat(f.latitude) : null
    const lng = f.longitude ? parseFloat(f.longitude) : null
    const km = f.radiusKm ? parseFloat(f.radiusKm) : null
    const { error } = await updateBusiness(business.id, {
      name: f.name.trim(),
      category: f.category,
      description: f.description.trim() || null,
      priceRange: f.priceRange.trim() || null,
      latitude: lat != null && !Number.isNaN(lat) ? lat : null,
      longitude: lng != null && !Number.isNaN(lng) ? lng : null,
      serviceRadiusM: km != null && !Number.isNaN(km) ? Math.round(km * 1000) : null,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      hours,
    })
    setSaving(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success("Storefront updated")
    onSaved()
  }

  function useGps() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return toast.error("Location not available")
    setGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((p) => ({ ...p, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }))
        setGps(false)
        toast.success("Location captured")
      },
      () => {
        setGps(false)
        toast.error("Couldn't get your location")
      },
    )
  }

  const previewTags = f.tags.split(",").map((t) => t.trim()).filter(Boolean)
  const openNow = isOpenNow(hours)

  return (
    <div className="space-y-4">
      {/* Live preview of the customer-facing card */}
      <SectionCard
        title={
          <span className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
            <Eye className="h-4 w-4 text-accent" /> What customers see
          </span>
        }
      >
        <div className="rounded-xl border border-border bg-background p-3.5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
              <Store className="h-5 w-5 text-accent" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-semibold text-foreground">{f.name || "Your business name"}</p>
                {business.isVerified && (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">Verified</span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${openNow ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                >
                  {openNow ? "Open now" : "Closed"}
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {f.category}
                {f.priceRange ? ` · ${f.priceRange}` : ""}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <Stars rating={business.ratingAvg} />
                <span className="text-[11.5px] text-muted-foreground">
                  {business.ratingCount > 0 ? `${business.ratingAvg} (${business.ratingCount})` : "No reviews yet"}
                </span>
              </div>
              {f.description && <p className="mt-1.5 line-clamp-2 text-[12.5px] text-muted-foreground">{f.description}</p>}
              {previewTags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {previewTags.map((t) => (
                    <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Profile */}
      <SectionCard title="Business profile">
        <div className="flex flex-col gap-3">
          <Field label="Business name">
            <TextInput value={f.name} onChange={(v) => setF((p) => ({ ...p, name: v }))} />
          </Field>
          <Field label="Category">
            <select
              value={f.category}
              onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground focus:border-accent focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <textarea
              value={f.description}
              onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder="What you offer, specialties, what makes you different…"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price range">
              <TextInput value={f.priceRange} onChange={(v) => setF((p) => ({ ...p, priceRange: v }))} placeholder="$ · $$ · $$$" />
            </Field>
            <Field label="Service radius (km)">
              <TextInput value={f.radiusKm} onChange={(v) => setF((p) => ({ ...p, radiusKm: v }))} placeholder="8" />
            </Field>
          </div>
          <Field label="Tags (comma separated)">
            <TextInput value={f.tags} onChange={(v) => setF((p) => ({ ...p, tags: v }))} placeholder="Cat-friendly, Mobile, 24h" />
          </Field>
          <Field label="Location (drives nearby search)">
            <div className="flex gap-2">
              <TextInput value={f.latitude} onChange={(v) => setF((p) => ({ ...p, latitude: v }))} placeholder="Latitude" />
              <TextInput value={f.longitude} onChange={(v) => setF((p) => ({ ...p, longitude: v }))} placeholder="Longitude" />
            </div>
            <button
              onClick={useGps}
              disabled={gps}
              className="mt-2 flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-[13px] font-semibold text-foreground disabled:opacity-60"
            >
              {gps ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />} Use current location
            </button>
          </Field>
        </div>
      </SectionCard>

      {/* Hours */}
      <SectionCard title="Business hours">
        <p className="mb-3 text-[12.5px] text-muted-foreground">
          Hours drive the “Open now” badge automatically — no switch to remember.
        </p>
        <div className="space-y-1.5">
          {DAY_KEYS.map((d) => {
            const v = hours[d]
            return (
              <div key={d} className="flex items-center gap-2">
                <span className="w-24 flex-shrink-0 text-[13px] text-foreground">{DAY_LABEL[d]}</span>
                {v ? (
                  <>
                    <input
                      type="time"
                      value={v.open}
                      onChange={(e) => setHours((p) => ({ ...p, [d]: { ...v, open: e.target.value } }))}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] text-foreground focus:border-accent focus:outline-none"
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="time"
                      value={v.close}
                      onChange={(e) => setHours((p) => ({ ...p, [d]: { ...v, close: e.target.value } }))}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] text-foreground focus:border-accent focus:outline-none"
                    />
                    <button
                      onClick={() => setHours((p) => ({ ...p, [d]: null }))}
                      className="ml-auto text-[12px] font-semibold text-muted-foreground hover:text-destructive"
                    >
                      Closed
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-[13px] text-muted-foreground">Closed</span>
                    <button
                      onClick={() => setHours((p) => ({ ...p, [d]: { open: "09:00", close: "17:00" } }))}
                      className="ml-auto text-[12px] font-semibold text-accent"
                    >
                      Set hours
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </SectionCard>

      <button
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save storefront
      </button>

      {/* Catalog */}
      <ServiceCatalog businessId={business.id} services={services} isLoading={svcLoading} refetch={refetchServices} />
    </div>
  )
}

function ServiceCatalog({
  businessId,
  services,
  isLoading,
  refetch,
}: {
  businessId: string
  services: ServiceItem[]
  isLoading: boolean
  refetch: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [n, setN] = useState({ name: "", price: "", duration: "", description: "" })

  async function add() {
    const price = parseFloat(n.price)
    if (!n.name.trim() || Number.isNaN(price)) return toast.error("Name and price are required.")
    setBusy(true)
    const { error } = await createService(businessId, {
      name: n.name.trim(),
      description: n.description.trim() || undefined,
      priceCents: Math.round(price * 100),
      durationMin: n.duration ? parseInt(n.duration, 10) : null,
      sortOrder: services.length + 1,
    })
    setBusy(false)
    if (error) return toast.error("Couldn't add service", { description: error })
    toast.success("Service added")
    setN({ name: "", price: "", duration: "", description: "" })
    setAdding(false)
    refetch()
  }

  async function toggle(s: ServiceItem) {
    const { error } = await updateService(s.id, { active: !s.active })
    if (error) return toast.error("Couldn't update", { description: error })
    refetch()
  }

  async function remove(s: ServiceItem) {
    if (!confirm(`Remove “${s.name}” from your catalog?`)) return
    const { error } = await deleteService(s.id)
    if (error) return toast.error("Couldn't delete", { description: error })
    toast.success("Service removed")
    refetch()
  }

  return (
    <SectionCard
      title="Services & prices"
      action={
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> {adding ? "Close" : "Add service"}
        </button>
      }
    >
      <p className="mb-3 text-[12.5px] text-muted-foreground">
        This is the list residents browse and book from. A booking always references one of these.
      </p>

      {adding && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
          <TextInput value={n.name} onChange={(v) => setN((p) => ({ ...p, name: v }))} placeholder="Service name" />
          <div className="grid grid-cols-2 gap-2">
            <TextInput value={n.price} onChange={(v) => setN((p) => ({ ...p, price: v }))} placeholder="Price (e.g. 85)" />
            <TextInput value={n.duration} onChange={(v) => setN((p) => ({ ...p, duration: v }))} placeholder="Minutes (e.g. 90)" />
          </div>
          <TextInput value={n.description} onChange={(v) => setN((p) => ({ ...p, description: v }))} placeholder="Short description" />
          <button
            onClick={add}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add to catalog
          </button>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : services.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          No services yet — add one so residents can book you.
        </p>
      ) : (
        <div className="space-y-2">
          {services.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-[14px] font-semibold ${s.active ? "text-foreground" : "text-muted-foreground line-through"}`}>
                    {s.name}
                  </p>
                  {s.durationMin ? <span className="text-[11.5px] text-muted-foreground">{s.durationMin} min</span> : null}
                </div>
                {s.description && <p className="truncate text-[12px] text-muted-foreground">{s.description}</p>}
              </div>
              <p className="text-[15px] font-bold text-foreground">${(s.priceCents / 100).toFixed(2)}</p>
              <button
                onClick={() => toggle(s)}
                className={`rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold ${s.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
              >
                {s.active ? "Live" : "Hidden"}
              </button>
              <button onClick={() => remove(s)} className="rounded-lg bg-muted p-2 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
