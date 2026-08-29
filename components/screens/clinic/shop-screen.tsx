"use client"

import { useState } from "react"
import { Plus, PackageSearch } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import { useClinicLocations, updateLocation } from "@/lib/data/clinic/context"
import { useProducts, saveProduct, setStock } from "@/lib/data/clinic/shop"
import { useAppointmentTypes } from "@/lib/data/clinic/schedule"
import { formatMoney } from "@/lib/data/clinic/time"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Modal,
  Field, TextInput, SegmentedTabs, Toolbar,
} from "@/components/screens/shared/ui"

type View = "storefront" | "catalogue" | "services"

export function ClinicShopScreen({ clinic }: { clinic: ClinicMembership }) {
  const [view, setView] = useState<View>("storefront")
  const locations = useClinicLocations(clinic.businessId)
  const products = useProducts(clinic.businessId)
  const types = useAppointmentTypes(clinic.businessId)
  const [productOpen, setProductOpen] = useState(false)

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
                Your storefront is private until the practice is verified. Verifying puts you in Pet10x
                search, lets owners book online, and allows you to receive and hand back records.
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const q = window.prompt(`Stock on hand for ${p.name}`, String(p.quantity))
                          if (q === null) return
                          const n = Number.parseFloat(q)
                          if (!Number.isFinite(n)) return
                          const res = await setStock(clinic.businessId, p.id, null, n)
                          if (res.error) window.alert(res.error)
                          else products.refetch()
                        }}
                      >
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
        <SectionCard title="Services and prices" subtitle="Durations here drive the calendar">
          {types.isLoading ? (
            <Spinner />
          ) : types.data.length === 0 ? (
            <EmptyState title="No appointment types" />
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
                      <p className="text-[13.5px] font-semibold text-foreground">{t.name}</p>
                      <p className="text-[12px] text-muted-foreground">{t.durationMin} minutes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.isOnlineBookable && <Pill tone="accent">Bookable online</Pill>}
                    {!t.isActive && <Pill tone="neutral">Off</Pill>}
                    <span className="text-[13.5px] font-semibold tabular-nums">{formatMoney(t.priceCents)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
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
    </div>
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
