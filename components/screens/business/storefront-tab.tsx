"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect } from "@/components/ui/select"
import { ErrorText } from "@/components/ui/error-text"
import { useState } from "react"
import { toast } from "sonner"
import {
  updateBusiness,
  isOpenNow,
  DAY_KEYS,
  DAY_LABEL,
  type MyBusiness,
  type BusinessHours,
  formatPrice,
  currencySymbol,
} from "@/lib/data/business"
import {
  useBusinessServices,
  createService,
  updateService,
  archiveService,
  restoreService,
  type ServiceItem,
} from "@/lib/data/bookings"
import {
  feePercentLabel,
  parsePriceCents,
  validateServiceInput,
  youReceiveCents,
  type ServiceErrors,
  type ServiceInput,
} from "@/lib/data/fees"
import { validateContact, type ContactErrors } from "@/lib/data/business-contact"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SectionCard } from "@/components/ui/section-card"
import { Spinner } from "@/components/ui/spinner"
import { TextInput, Field, Stars } from "./business-ui"
import { Navigation, Plus, Archive, ArchiveRestore, ChevronDown, Store, MapPin, Star, Eye, Pencil, Phone, Mail } from "lucide-react"

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
    address: business.address ?? "",
    city: business.city ?? "",
    region: business.region ?? "",
    postalCode: business.postalCode ?? "",
    contactPhone: business.contactPhone ?? "",
    contactEmail: business.contactEmail ?? "",
  })
  const [contactErrors, setContactErrors] = useState<ContactErrors>({})
  const [hours, setHours] = useState<BusinessHours>(
    business.hours ?? Object.fromEntries(DAY_KEYS.map((d) => [d, { open: "09:00", close: "17:00" }])),
  )

  async function save() {
    /* The same grammars as the database's CHECKs, so a bad number is named
       here rather than refused by Postgres in words nobody can act on. */
    const contact = validateContact({ phone: f.contactPhone, email: f.contactEmail })
    if (!contact.ok) {
      setContactErrors(contact.errors)
      toast.error("Check your contact details", { description: "Fix the highlighted fields, then save again." })
      return
    }
    setContactErrors({})
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
      address: f.address.trim() || null,
      city: f.city.trim() || null,
      region: f.region.trim() || null,
      postalCode: f.postalCode.trim() || null,
      contactPhone: contact.value.phone,
      contactEmail: contact.value.email,
    })
    setSaving(false)
    if (error) return toast.error("Couldn't save your storefront", { description: "Try again." })
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
          <span className="flex items-center gap-1.5 text-body font-semibold text-foreground">
            <Eye className="h-4 w-4 text-primary" /> What customers see
          </span>
        }
      >
        <div className="rounded-xl border border-border bg-background p-3.5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft">
              <Store className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-body font-semibold text-foreground">{f.name || "Your business name"}</p>
                {business.isVerified && (
                  <Badge variant="success">Verified</Badge>
                )}
                <Badge variant={openNow ? "success" : "neutral"}>
                  {openNow ? "Open now" : "Closed"}
                </Badge>
              </div>
              <p className="text-caption text-muted-foreground">
                {f.category}
                {f.priceRange ? ` · ${f.priceRange}` : ""}
              </p>
              {(f.address || f.city) && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-caption text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {[f.address, f.city, f.region].filter(Boolean).join(", ")}
                </p>
              )}
              <div className="mt-0.5 flex items-center gap-1.5">
                <Stars rating={business.ratingAvg} />
                <span className="text-caption text-muted-foreground">
                  {business.ratingCount > 0 ? `${business.ratingAvg} (${business.ratingCount})` : "No reviews yet"}
                </span>
              </div>
              {(f.contactPhone.trim() || f.contactEmail.trim()) && (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-caption text-muted-foreground">
                  {f.contactPhone.trim() && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {f.contactPhone.trim()}
                    </span>
                  )}
                  {f.contactEmail.trim() && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {f.contactEmail.trim()}
                    </span>
                  )}
                </p>
              )}
              {f.description && <p className="mt-1.5 line-clamp-2 text-caption text-muted-foreground">{f.description}</p>}
              {previewTags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {previewTags.map((t) => (
                    <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-caption text-muted-foreground">
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
            <NativeSelect
              value={f.category}
              onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Description">
            <Textarea
              value={f.description}
              onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder="What you offer, specialties, what makes you different…"
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
          <Field label="Street address">
            <TextInput value={f.address} onChange={(v) => setF((p) => ({ ...p, address: v }))} placeholder="1487 W Broadway" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City">
              <TextInput value={f.city} onChange={(v) => setF((p) => ({ ...p, city: v }))} placeholder="Vancouver" />
            </Field>
            <Field label="Region">
              <TextInput value={f.region} onChange={(v) => setF((p) => ({ ...p, region: v }))} placeholder="BC" />
            </Field>
            <Field label="Postal code">
              <TextInput value={f.postalCode} onChange={(v) => setF((p) => ({ ...p, postalCode: v }))} placeholder="V6H 1H6" />
            </Field>
          </div>

          <Field label="Coordinates (drives distance & nearby search)">
            <div className="flex gap-2">
              <TextInput value={f.latitude} onChange={(v) => setF((p) => ({ ...p, latitude: v }))} placeholder="Latitude" />
              <TextInput value={f.longitude} onChange={(v) => setF((p) => ({ ...p, longitude: v }))} placeholder="Longitude" />
            </div>
            <p className="mt-1.5 text-caption text-muted-foreground">
              Residents outside your {f.radiusKm || "—"}{" "}
              km service radius can filter you out, so keep both accurate.
            </p>
            <Button variant="secondary" size="sm" className="mt-2" onClick={useGps} loading={gps}>
              {!gps && <Navigation className="h-4 w-4" />} Use current location
            </Button>
          </Field>
        </div>
      </SectionCard>

      {/* Contact — shown on your page and on every confirmed booking. */}
      <SectionCard title="How customers reach you">
        <p className="mb-3 text-caption text-muted-foreground">
          Shown on your page and on customers&apos; confirmed bookings, so they can call or email you about a visit.
          Both are optional.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ContactInput
            id="storefront-contact-phone"
            label="Phone"
            type="tel"
            autoComplete="tel"
            value={f.contactPhone}
            onChange={(v) => {
              setF((p) => ({ ...p, contactPhone: v }))
              setContactErrors((e) => ({ ...e, phone: undefined }))
            }}
            placeholder="+1 604 555 0199"
            error={contactErrors.phone}
          />
          <ContactInput
            id="storefront-contact-email"
            label="Email"
            type="email"
            autoComplete="email"
            value={f.contactEmail}
            onChange={(v) => {
              setF((p) => ({ ...p, contactEmail: v }))
              setContactErrors((e) => ({ ...e, email: undefined }))
            }}
            placeholder="hello@yourbusiness.ca"
            error={contactErrors.email}
          />
        </div>
      </SectionCard>

      {/* Hours */}
      <SectionCard title="Business hours">
        <p className="mb-3 text-caption text-muted-foreground">
          Hours drive the “Open now” badge automatically — no switch to remember.
        </p>
        <div className="space-y-1.5">
          {DAY_KEYS.map((d) => {
            const v = hours[d]
            return (
              <div key={d} className="flex flex-wrap items-center gap-2">
                <span className="w-24 flex-shrink-0 text-meta text-foreground">{DAY_LABEL[d]}</span>
                {v ? (
                  <>
                    <Input
                      type="time"
                      className="w-auto min-w-0 flex-1"
                      value={v.open}
                      onChange={(e) => setHours((p) => ({ ...p, [d]: { ...v, open: e.target.value } }))}
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      className="w-auto min-w-0 flex-1"
                      value={v.close}
                      onChange={(e) => setHours((p) => ({ ...p, [d]: { ...v, close: e.target.value } }))}
                    />
                    <Button
                      variant="quiet"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setHours((p) => ({ ...p, [d]: null }))}
                    >
                      Closed
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-meta text-muted-foreground">Closed</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setHours((p) => ({ ...p, [d]: { open: "09:00", close: "17:00" } }))}
                    >
                      Set hours
                    </Button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </SectionCard>

      <Button size="lg" className="w-full" onClick={save} loading={saving}>
        Save storefront
      </Button>

      {/* Catalog */}
      <ServiceCatalog businessId={business.id} services={services} isLoading={svcLoading} refetch={refetchServices} />
    </div>
  )
}

/** A labelled field whose error is read out with it (aria-describedby). */
function ContactInput({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  placeholder,
  error,
}: {
  id: string
  label: string
  type: "tel" | "email"
  autoComplete: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  error?: string
}) {
  const errorId = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-caption font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        type={type}
        inputMode={type === "tel" ? "tel" : "email"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <ErrorText id={errorId} className="mt-1 text-caption">
          {error}
        </ErrorText>
      )}
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
  const [n, setN] = useState<ServiceInput>({ name: "", price: "", duration: "" })
  const [description, setDescription] = useState("")
  const [errors, setErrors] = useState<ServiceErrors>({})
  const [editing, setEditing] = useState<ServiceItem | null>(null)
  const [archiving, setArchiving] = useState<ServiceItem | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const live = services.filter((s) => s.active)
  const archived = services.filter((s) => !s.active)
  // New services take the column default; existing ones show their own.
  const currency = services[0]?.currency ?? "cad"

  async function add() {
    const checked = validateServiceInput(n)
    if (!checked.ok) return setErrors(checked.errors)
    setErrors({})
    setBusy(true)
    const { error } = await createService(businessId, {
      name: checked.value.name,
      description: description.trim() || undefined,
      priceCents: checked.value.priceCents,
      durationMin: checked.value.durationMin,
      sortOrder: services.length + 1,
    })
    setBusy(false)
    // Never the database's text: the form has already checked every field.
    if (error) return toast.error("Couldn't add the service", { description: "Try again." })
    toast.success("Service added")
    setN({ name: "", price: "", duration: "" })
    setDescription("")
    setAdding(false)
    refetch()
  }

  /* The dialog keeps a failure on screen, so only success toasts. */
  async function archive(s: ServiceItem): Promise<{ error: string | null }> {
    const { error } = await archiveService(s.id)
    if (error) return { error: "Couldn't archive the service. Try again." }
    toast.success("Service archived")
    refetch()
    return { error: null }
  }

  async function restore(s: ServiceItem) {
    setRestoring(s.id)
    const { error } = await restoreService(s.id)
    setRestoring(null)
    if (error) return toast.error("Couldn't restore the service", { description: "Try again." })
    toast.success("Service restored")
    refetch()
  }

  return (
    <SectionCard
      title="Services & prices"
      actions={
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> {adding ? "Close" : "Add service"}
        </Button>
      }
    >
      <p className="mb-3 text-caption text-muted-foreground">
        This is the list residents browse and book from. A booking always references one of these. Customers pay you
        directly; Pet10x keeps {feePercentLabel()} of each completed booking.
      </p>

      {adding && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
          <ServiceFields value={n} onChange={setN} errors={errors} currency={currency} />
          <TextInput value={description} onChange={setDescription} placeholder="Short description" />
          <Button size="sm" onClick={add} loading={busy}>
            Add to catalog
          </Button>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : live.length === 0 ? (
        <p className="py-6 text-center text-meta text-muted-foreground">
          {archived.length > 0
            ? "No services on your catalog — add one or restore an archived one so residents can book you."
            : "No services yet — add one so residents can book you."}
        </p>
      ) : (
        <div className="space-y-2">
          {live.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-body font-semibold text-foreground">{s.name}</p>
                  {s.durationMin ? <span className="text-caption text-muted-foreground">{s.durationMin} min</span> : null}
                </div>
                {s.description && <p className="truncate text-caption text-muted-foreground">{s.description}</p>}
              </div>
              <p className="text-body font-bold text-foreground">{formatPrice(s.priceCents, s.currency)}</p>
              <Button size="icon" variant="secondary" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="secondary" onClick={() => setArchiving(s)} aria-label={`Archive ${s.name}`}>
                <Archive className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Archived services stay out of the way but one tap from coming back. */}
      {!isLoading && archived.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="flex items-center gap-1 text-caption font-semibold text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showArchived ? "rotate-180" : ""}`} />
            Archived ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-2 space-y-2">
              {archived.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-semibold text-muted-foreground">{s.name}</p>
                    <p className="text-caption text-muted-foreground">Hidden from customers</p>
                  </div>
                  <p className="text-body text-muted-foreground">{formatPrice(s.priceCents, s.currency)}</p>
                  <Button size="sm" variant="secondary" onClick={() => restore(s)} loading={restoring === s.id}>
                    {restoring !== s.id && <ArchiveRestore className="h-3.5 w-3.5" />}
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={archiving ? `Archive ${archiving.name}?` : "Archive this service?"}
        description="Customers can no longer see or book it. Past bookings keep this service's name, and you can restore it any time."
        confirmLabel="Archive"
        onConfirm={() => (archiving ? archive(archiving) : Promise.resolve({ error: null }))}
      />

      <EditServiceDialog
        service={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          refetch()
        }}
      />
    </SectionCard>
  )
}

/** Name, price and minutes — shared by the add form and the edit dialog. */
function ServiceFields({
  value,
  onChange,
  errors,
  currency,
}: {
  value: ServiceInput
  onChange: (next: ServiceInput) => void
  errors: ServiceErrors
  currency: string
}) {
  return (
    <>
      <div>
        <TextInput value={value.name} onChange={(v) => onChange({ ...value, name: v })} placeholder="Service name" />
        <FieldError message={errors.name} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PriceInput value={value.price} onChange={(v) => onChange({ ...value, price: v })} currency={currency} error={errors.price} />
        <div>
          <TextInput value={value.duration} onChange={(v) => onChange({ ...value, duration: v })} placeholder="Minutes (e.g. 90)" />
          <FieldError message={errors.duration} />
        </div>
      </div>
    </>
  )
}

/**
 * A price with its currency mark in front and, as you type, what you keep
 * after the Pet10x fee — so the fee is never a surprise in Earnings.
 */
function PriceInput({
  value,
  onChange,
  currency,
  error,
}: {
  value: string
  onChange: (v: string) => void
  currency: string
  error?: string
}) {
  const parsed = parsePriceCents(value)
  return (
    <div>
      <div className="flex items-center rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary">
        <span className="pl-3.5 text-body text-muted-foreground">{currencySymbol(currency)}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          aria-label="Price"
          placeholder="85"
          className="w-full min-w-0 bg-transparent py-2.5 pl-1.5 pr-3.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      {error ? (
        <FieldError message={error} />
      ) : (
        <p className="mt-1 text-caption text-muted-foreground">
          {parsed.ok
            ? `You receive ${formatPrice(youReceiveCents(parsed.cents), currency)}`
            : `You receive the price minus the ${feePercentLabel()} Pet10x fee`}
        </p>
      )}
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <ErrorText className="mt-1 text-caption">{message}</ErrorText>
  )
}

/**
 * Change a service's name, price or minutes. Past bookings keep the price
 * they were made at (amount_cents is stored on the booking), so editing the
 * price only affects new requests.
 */
function EditServiceDialog({
  service,
  onClose,
  onSaved,
}: {
  service: ServiceItem | null
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog open={service !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed so each service opens with its own values, not the last one's edits. */}
        {service && <EditServiceForm key={service.id} service={service} onCancel={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function EditServiceForm({
  service,
  onCancel,
  onSaved,
}: {
  service: ServiceItem
  onCancel: () => void
  onSaved: () => void
}) {
  const [v, setV] = useState<ServiceInput>({
    name: service.name,
    price: (service.priceCents / 100).toFixed(2),
    duration: service.durationMin != null ? String(service.durationMin) : "",
  })
  const [errors, setErrors] = useState<ServiceErrors>({})
  const [busy, setBusy] = useState(false)

  async function save() {
    const checked = validateServiceInput(v)
    if (!checked.ok) return setErrors(checked.errors)
    setErrors({})
    setBusy(true)
    const { error } = await updateService(service.id, {
      name: checked.value.name,
      priceCents: checked.value.priceCents,
      durationMin: checked.value.durationMin,
    })
    setBusy(false)
    // Never the database's text: the form has already checked every field.
    if (error) return toast.error("Couldn't save the service", { description: "Try again." })
    toast.success("Service updated")
    onSaved()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-left">Edit service</DialogTitle>
        <DialogDescription className="text-left">
          New requests use these details. Bookings already made keep the price they were made at.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <ServiceFields value={v} onChange={setV} errors={errors} currency={service.currency} />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={save} loading={busy}>
          Save
        </Button>
      </div>
    </>
  )
}
