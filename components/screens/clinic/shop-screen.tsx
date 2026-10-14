"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Plus, PackageSearch } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import { useClinicLocations, updateLocation, capabilities } from "@/lib/data/clinic/context"
import { useProducts, saveProduct, setStock, type Product } from "@/lib/data/clinic/shop"
import { useAppointmentTypes, saveAppointmentType, type AppointmentType } from "@/lib/data/clinic/schedule"
import { validateAppointmentType, typePriceLabel } from "@/lib/data/clinic/appointment-type-form"
import type { ServiceErrors } from "@/lib/data/fees"
import { formatMoney } from "@/lib/data/clinic/time"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Modal,
  Field, TextInput, SegmentedTabs, Toolbar,
} from "@/components/screens/shared/ui"

export type ShopView = "storefront" | "catalogue" | "services"

export function ClinicShopScreen({
  clinic,
  initialView = "storefront",
}: {
  clinic: ClinicMembership
  /** Today's set-up checklist opens Services and prices directly. */
  initialView?: ShopView
}) {
  const [view, setView] = useState<ShopView>(initialView)
  const locations = useClinicLocations(clinic.businessId)
  const products = useProducts(clinic.businessId)
  const types = useAppointmentTypes(clinic.businessId)
  const [productOpen, setProductOpen] = useState(false)
  const [stockFor, setStockFor] = useState<Product | null>(null)
  const canEditServices = capabilities(clinic.role, clinic.tier, clinic.isOwner).manageSchedule

  const primary = locations.data.find((l) => l.isPrimary) ?? locations.data[0]

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <SegmentedTabs
          label="Shop sections"
          active={view}
          onChange={setView}
          tabs={[
            { id: "storefront", label: "Storefront" },
            { id: "catalogue", label: "Catalogue", count: products.data.length },
            { id: "services", label: "Services & prices", count: types.data.length },
          ]}
        />
        {view === "catalogue" && (
          <div className="ml-auto">
            <Button size="sm" onClick={() => setProductOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add product
            </Button>
          </div>
        )}
      </Toolbar>

      {view === "storefront" && (
        <>
          {locations.isLoading ? (
            <Spinner />
          ) : !primary ? (
            <EmptyState title="No location yet" />
          ) : (
            <LocationEditor
              key={primary.id}
              id={primary.id}
              name={primary.name}
              phone={primary.phone}
              address={primary.address}
              afterHours={primary.afterHoursNote}
              onSaved={locations.refetch}
            />
          )}
          {clinic.tier !== "verified" && (
            <SectionCard title="Get listed">
              <p className="text-[13px] text-muted-foreground">
                {clinic.tier === "registered"
                  ? "Your storefront is private until Pet10x lists the practice. Listed practices appear in owner search and take online bookings; verified practices can also receive and hand back records."
                  : "You're listed in owner search. Verification also lets you receive and hand back records."}{" "}
                Request verification from the banner on Today.
              </p>
            </SectionCard>
          )}
        </>
      )}

      {view === "catalogue" &&
        (products.isLoading ? (
          <Spinner />
        ) : products.error ? (
          <LoadError message={products.error} onRetry={products.refetch} />
        ) : products.data.length === 0 ? (
          <EmptyState
            title="Nothing in the catalogue"
            detail="Food, preventatives and accessories you sell at the counter."
            icon={<PackageSearch className="h-5 w-5" aria-hidden="true" />}
            action={<Button size="sm" onClick={() => setProductOpen(true)}>Add a product</Button>}
          />
        ) : (
          <SectionCard>
            <ul className="flex flex-col gap-2">
              {products.data.map((p) => {
                const low = p.reorderPoint !== null && p.quantity <= p.reorderPoint
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-foreground">{p.name}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {[p.category, p.sku].filter(Boolean).join(" · ") || "Uncategorised"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={low ? "bad" : "neutral"}>
                        {p.quantity} in stock{low ? " · reorder" : ""}
                      </Pill>
                      <span className="text-[13.5px] font-semibold tabular-nums text-foreground">
                        {formatMoney(p.priceCents)}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setStockFor(p)}>
                        Set stock
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </SectionCard>
        ))}

      {view === "services" && (
        <ServicesEditor
          businessId={clinic.businessId}
          types={types}
          canEdit={canEditServices}
        />
      )}

      <Modal open={productOpen} onClose={() => setProductOpen(false)} title="Add a product">
        <ProductForm
          businessId={clinic.businessId}
          onSaved={() => {
            setProductOpen(false)
            products.refetch()
          }}
          onCancel={() => setProductOpen(false)}
        />
      </Modal>

      {stockFor && (
        <StockModal
          key={stockFor.id}
          product={stockFor}
          businessId={clinic.businessId}
          onClose={() => setStockFor(null)}
          onSaved={() => {
            setStockFor(null)
            products.refetch()
          }}
        />
      )}
    </div>
  )
}

/** Stock on hand: a count, optionally with up to two decimals (kilos of food). */
const STOCK = /^\s*(\d{1,6}(?:\.\d{1,2})?)\s*$/

function StockModal({
  product, businessId, onClose, onSaved,
}: {
  product: Product
  businessId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState(String(product.quantity))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    const m = STOCK.exec(value)
    if (!m) return setError("Enter a number like 12 or 12.5.")
    setBusy(true)
    setError(null)
    const res = await setStock(businessId, product.id, null, Number(m[1]))
    setBusy(false)
    if (res.error) return setError(res.error)
    toast.success(`Stock updated for ${product.name}`)
    onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Stock on hand for ${product.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button busy={busy} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <Field label="In stock" required error={error}>
        {(p) => <TextInput {...p} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />}
      </Field>
    </Modal>
  )
}

/**
 * Services and prices — the appointment types the calendar and online booking
 * use. Edited in place; never deleted (past appointments point at them), only
 * switched off.
 */
function ServicesEditor({
  businessId, types, canEdit,
}: {
  businessId: string
  types: ReturnType<typeof useAppointmentTypes>
  canEdit: boolean
}) {
  // null = closed; "new" = adding; otherwise the type being edited.
  const [editing, setEditing] = useState<AppointmentType | "new" | null>(null)
  return (
    <SectionCard
      title="Services and prices"
      subtitle="Durations here drive the calendar. Online-bookable services show on your booking page."
      actions={
        canEdit ? (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add service
          </Button>
        ) : undefined
      }
    >
      {types.isLoading ? (
        <Spinner />
      ) : types.error ? (
        <LoadError message={types.error} onRetry={types.refetch} />
      ) : types.data.length === 0 ? (
        <EmptyState
          title="No services yet"
          detail="Add what you book appointments for, with how long each takes."
          action={canEdit ? <Button size="sm" onClick={() => setEditing("new")}>Add a service</Button> : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {types.data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: t.colour }}
                />
                <div>
                  <p className={`text-[13.5px] font-semibold ${t.isActive ? "text-foreground" : "text-muted-foreground"}`}>
                    {t.name}
                  </p>
                  <p className="text-[12px] text-muted-foreground">{t.durationMin} minutes</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {t.isOnlineBookable && t.isActive && <Pill tone="accent">Bookable online</Pill>}
                {!t.isActive && <Pill tone="neutral">Switched off</Pill>}
                <span className="text-[13.5px] font-semibold tabular-nums">{typePriceLabel(t.priceCents)}</span>
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>
                    Edit
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <AppointmentTypeModal
          key={editing === "new" ? "new" : editing.id}
          businessId={businessId}
          type={editing === "new" ? null : editing}
          nextSortOrder={types.data.length}
          onClose={() => setEditing(null)}
          onSaved={(name, isNew) => {
            setEditing(null)
            toast.success(isNew ? `Added ${name}` : `Saved ${name}`)
            types.refetch()
          }}
        />
      )}
    </SectionCard>
  )
}

function AppointmentTypeModal({
  businessId, type, nextSortOrder, onClose, onSaved,
}: {
  businessId: string
  type: AppointmentType | null
  nextSortOrder: number
  onClose: () => void
  onSaved: (name: string, isNew: boolean) => void
}) {
  const [f, setF] = useState({
    name: type?.name ?? "",
    duration: type ? String(type.durationMin) : "30",
    // 0 is "not set": the field starts empty rather than claiming $0.00.
    price: type && type.priceCents > 0 ? (type.priceCents / 100).toFixed(2) : "",
    online: type?.isOnlineBookable ?? false,
    active: type?.isActive ?? true,
  })
  const [errors, setErrors] = useState<ServiceErrors>({})
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    const checked = validateAppointmentType({ name: f.name, duration: f.duration, price: f.price })
    if (!checked.ok) return setErrors(checked.errors)
    setErrors({})
    setFailed(null)
    setBusy(true)
    const res = await saveAppointmentType({
      id: type?.id,
      businessId,
      ...checked.value,
      isOnlineBookable: f.online,
      isActive: f.active,
      sortOrder: nextSortOrder,
    })
    setBusy(false)
    if (res.error) return setFailed(res.error)
    onSaved(checked.value.name, !type)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={type ? `Edit ${type.name}` : "Add a service"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button busy={busy} onClick={() => void save()}>{type ? "Save" : "Add service"}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Name" required error={errors.name}>
          {(p) => <TextInput {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Duration (minutes)" required error={errors.duration}>
            {(p) => (
              <TextInput {...p} inputMode="numeric" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} />
            )}
          </Field>
          <Field label="Price (dollars)" hint="Leave empty to show Price on request." error={errors.price}>
            {(p) => (
              <TextInput {...p} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
            )}
          </Field>
        </div>
        <label className="flex items-start gap-2 text-[13px] text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={f.online}
            onChange={(e) => setF({ ...f, online: e.target.checked })}
          />
          <span>
            Owners can book this online
            <span className="block text-[11.5px] text-muted-foreground">Shown on your booking page once you are listed.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={f.active}
            onChange={(e) => setF({ ...f, active: e.target.checked })}
          />
          <span>
            Offered
            <span className="block text-[11.5px] text-muted-foreground">
              Switch off a service you no longer offer. Past appointments keep it.
            </span>
          </span>
        </label>
        {failed && <p role="alert" className="text-[12px] text-destructive">{failed}</p>}
      </div>
    </Modal>
  )
}

function ProductForm({
  businessId, onSaved, onCancel,
}: {
  businessId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [f, setF] = useState({ name: "", category: "", price: "", reorder: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex w-full flex-col gap-3">
      <Field label="Name" required error={error}>
        {(p) => <TextInput {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category">
          {(p) => <TextInput {...p} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />}
        </Field>
        <Field label="Price (dollars)">
          {(p) => <TextInput {...p} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />}
        </Field>
        <Field label="Reorder at">
          {(p) => <TextInput {...p} inputMode="numeric" value={f.reorder} onChange={(e) => setF({ ...f, reorder: e.target.value })} />}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button
          busy={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const price = Math.round(Number.parseFloat(f.price || "0") * 100)
            const reorder = f.reorder ? Number.parseFloat(f.reorder) : null
            const res = await saveProduct({
              businessId,
              name: f.name,
              category: f.category,
              priceCents: Number.isFinite(price) ? price : 0,
              reorderPoint: reorder,
            })
            setBusy(false)
            if (res.error) setError(res.error)
            else onSaved()
          }}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

function LocationEditor({
  id, name, phone, address, afterHours, onSaved,
}: {
  id: string
  name: string
  phone: string | null
  address: string | null
  afterHours: string | null
  onSaved: () => void
}) {
  const [f, setF] = useState({ name, phone: phone ?? "", address: address ?? "", afterHours: afterHours ?? "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <SectionCard title="Main location" subtitle="What the public sees once you are listed">
      <div className="flex flex-col gap-3">
        <Field label="Location name" required error={error}>
          {(p) => <TextInput {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone">
            {(p) => <TextInput {...p} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}
          </Field>
          <Field label="Address">
            {(p) => <TextInput {...p} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />}
          </Field>
        </div>
        <Field label="After-hours arrangement" hint="Shown to owners looking for help at 2am.">
          {(p) => <TextInput {...p} value={f.afterHours} onChange={(e) => setF({ ...f, afterHours: e.target.value })} />}
        </Field>
        <div>
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              const res = await updateLocation(id, {
                name: f.name,
                phone: f.phone || null,
                address: f.address || null,
                after_hours_note: f.afterHours || null,
              })
              setBusy(false)
              if (res.error) setError(res.error)
              else onSaved()
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </SectionCard>
  )
}
