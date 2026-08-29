"use client"

import { useState } from "react"
import { Search, Plus, KeyRound, ShieldCheck, Phone, Pencil, PawPrint, Archive } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import { capabilities, useClinicStaff } from "@/lib/data/clinic/context"
import {
  useClinicCustomers, createCustomerWithPatient, redeemDeskCode,
  updateCustomer, addPatientToCustomer, archiveCustomer,
  type ClinicCustomer,
} from "@/lib/data/clinic/customers"
import { PatientPanel } from "./patient-panel"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Modal,
  Field, TextInput, Select, SpeciesIcon, LinkedBadge, Toolbar,
} from "@/components/screens/shared/ui"

export function ClinicCustomersScreen({ clinic }: { clinic: ClinicMembership }) {
  const [search, setSearch] = useState("")
  const customers = useClinicCustomers(clinic.businessId, search)
  const staff = useClinicStaff(clinic.businessId)
  const [newOpen, setNewOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [patientId, setPatientId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ClinicCustomer | null>(null)
  const [addingTo, setAddingTo] = useState<ClinicCustomer | null>(null)
  const caps = capabilities(clinic.role, clinic.tier, clinic.isOwner)

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <label htmlFor="cust-search" className="sr-only">
            Search customers
          </label>
          <input
            id="cust-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone or email"
            className="w-full rounded-xl border border-input bg-card py-2 pl-9 pr-3 text-[13.5px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        {caps.readSharedRecords && (
          <Button variant="secondary" size="sm" onClick={() => setCodeOpen(true)}>
            <KeyRound className="h-4 w-4" aria-hidden="true" /> Desk code
          </Button>
        )}
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New customer
        </Button>
      </Toolbar>

      {customers.isLoading ? (
        <Spinner label="Loading customers" />
      ) : customers.error ? (
        <LoadError message={customers.error} onRetry={customers.refetch} />
      ) : customers.data.length === 0 ? (
        <EmptyState
          title={search ? "No match" : "No customers yet"}
          detail={
            search
              ? "Try a shorter search — spelling on the phone is rarely exact."
              : "Add your first customer, or import your client list from a spreadsheet."
          }
          action={<Button size="sm" onClick={() => setNewOpen(true)}>Add a customer</Button>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {customers.data.map((c) => (
            <CustomerRow
              key={c.id}
              c={c}
              onOpenPatient={setPatientId}
              onEdit={() => setEditing(c)}
              onAddAnimal={() => setAddingTo(c)}
            />
          ))}
        </div>
      )}

      <NewCustomerModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        businessId={clinic.businessId}
        onCreated={() => {
          setNewOpen(false)
          customers.refetch()
        }}
      />

      <DeskCodeModal
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        businessId={clinic.businessId}
        onDone={() => {
          setCodeOpen(false)
          customers.refetch()
        }}
      />

      <EditCustomerModal
        customer={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          customers.refetch()
        }}
      />

      <AddAnimalModal
        customer={addingTo}
        businessId={clinic.businessId}
        onClose={() => setAddingTo(null)}
        onSaved={() => {
          setAddingTo(null)
          customers.refetch()
        }}
      />

      <Modal
        open={patientId !== null}
        onClose={() => setPatientId(null)}
        title="Patient"
        wide
      >
        {patientId && (
          <PatientPanel
            patientId={patientId}
            clinic={clinic}
            staffId={staff.data.find((s) => s.profileId)?.id ?? null}
          />
        )}
      </Modal>
    </div>
  )
}

function CustomerRow({
  c,
  onOpenPatient,
  onEdit,
  onAddAnimal,
}: {
  c: ClinicCustomer
  onOpenPatient: (id: string) => void
  onEdit: () => void
  onAddAnimal: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-foreground">
            {c.fullName}
            {c.isLinked && <Pill tone="accent">Pet10x</Pill>}
            {!c.serviceReminders && <Pill tone="neutral">No reminders</Pill>}
          </p>
          <p className="text-[12.5px] text-muted-foreground">
            {[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}
          </p>
          {c.alertNote && (
            <p className="mt-1 text-[12px] font-medium text-warning-strong">{c.alertNote}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {c.phone && (
            <a
              href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Call ${c.fullName}`}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          <span
            role="button"
            tabIndex={0}
            aria-label={`Edit ${c.fullName}`}
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                e.stopPropagation()
                onEdit()
              }
            }}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </span>
          <Pill tone="neutral">
            {c.patientCount} {c.patientCount === 1 ? "animal" : "animals"}
          </Pill>
        </div>
      </button>
      {open && (
        <div className="border-t border-border p-3">
          <div className="mb-2 flex justify-end">
            <Button size="sm" variant="secondary" onClick={onAddAnimal}>
              <PawPrint className="h-4 w-4" aria-hidden="true" /> Add an animal
            </Button>
          </div>
          {c.patients.length === 0 ? (
            <p className="px-1 text-[12.5px] text-muted-foreground">No animals on this record yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {c.patients.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPatient(p.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-left hover:bg-secondary"
                  >
                    <span className="flex items-center gap-2 text-[13.5px] font-medium text-foreground">
                      <SpeciesIcon species={p.species} />
                      {p.name}
                      {p.breed && <span className="text-[12px] text-muted-foreground">{p.breed}</span>}
                      {p.isDeceased && <Pill tone="neutral">Deceased</Pill>}
                    </span>
                    <LinkedBadge linked={p.isLinked} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function NewCustomerModal({
  open, onClose, businessId, onCreated,
}: {
  open: boolean
  onClose: () => void
  businessId: string
  onCreated: () => void
}) {
  const [f, setF] = useState({
    firstName: "", lastName: "", phone: "", email: "",
    petName: "", species: "dog", breed: "",
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New customer"
      description="Works whether or not they use Pet10x."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              const res = await createCustomerWithPatient(businessId, {
                firstName: f.firstName,
                lastName: f.lastName,
                phone: f.phone,
                email: f.email,
                petName: f.petName,
                species: f.species as "dog",
                breed: f.breed,
              })
              setBusy(false)
              if (res.error) setError(res.error)
              else {
                setF({ firstName: "", lastName: "", phone: "", email: "", petName: "", species: "dog", breed: "" })
                onCreated()
              }
            }}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" required error={error}>
            {(p) => <TextInput {...p} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />}
          </Field>
          <Field label="Last name">
            {(p) => <TextInput {...p} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />}
          </Field>
          <Field label="Phone">
            {(p) => <TextInput {...p} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}
          </Field>
          <Field label="Email">
            {(p) => <TextInput {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
          </Field>
        </div>
        <div className="rounded-xl bg-secondary p-3">
          <p className="mb-2 text-[12px] font-semibold text-foreground">Their animal (optional)</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name">
              {(p) => <TextInput {...p} value={f.petName} onChange={(e) => setF({ ...f, petName: e.target.value })} />}
            </Field>
            <Field label="Species">
              {(p) => (
                <Select {...p} value={f.species} onChange={(e) => setF({ ...f, species: e.target.value })}>
                  <option value="dog">Dog</option>
                  <option value="cat">Cat</option>
                  <option value="bird">Bird</option>
                  <option value="small_mammal">Small mammal</option>
                  <option value="reptile">Reptile</option>
                  <option value="fish">Fish</option>
                  <option value="other">Other</option>
                </Select>
              )}
            </Field>
            <Field label="Breed">
              {(p) => <TextInput {...p} value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })} />}
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function DeskCodeModal({
  open, onClose, businessId, onDone,
}: {
  open: boolean
  onClose: () => void
  businessId: string
  onDone: () => void
}) {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  return (
    <Modal
      open={open}
      onClose={() => {
        setOk(false)
        setCode("")
        setError(null)
        onClose()
      }}
      title="Redeem a desk code"
      description="The owner reads out a six-character code from their app."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              const res = await redeemDeskCode(businessId, code)
              setBusy(false)
              if (res.error) setError(res.error)
              else {
                setOk(true)
                onDone()
              }
            }}
          >
            Redeem
          </Button>
        </>
      }
    >
      {ok ? (
        <p className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-[13px] font-medium text-success">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Records shared. Open the patient to read them.
        </p>
      ) : (
        <Field label="Code" required error={error} hint="Single use, valid for ten minutes.">
          {(p) => (
            <TextInput
              {...p}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="A7K2QM"
              maxLength={8}
              className="font-mono tracking-[0.2em]"
            />
          )}
        </Field>
      )}
    </Modal>
  )
}

function EditCustomerModal({
  customer, onClose, onSaved,
}: {
  customer: ClinicCustomer | null
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({
    firstName: "", lastName: "", phone: "", email: "", city: "", alertNote: "", reminders: true,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  // Reset the form when a different customer is opened.
  if (customer && loadedFor !== customer.id) {
    setLoadedFor(customer.id)
    setF({
      firstName: customer.firstName,
      lastName: customer.lastName ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      city: customer.city ?? "",
      alertNote: customer.alertNote ?? "",
      reminders: customer.serviceReminders,
    })
    setError(null)
  }

  return (
    <Modal
      open={customer !== null}
      onClose={onClose}
      title={customer ? `Edit ${customer.fullName}` : "Edit customer"}
      description="Their contact details and how they hear from you."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={async () => {
              if (!customer) return
              const ok = window.confirm(
                `Archive ${customer.fullName}?\n\nTheir visit history stays. They drop out of search and every reminder queue.`,
              )
              if (!ok) return
              const res = await archiveCustomer(customer.id, true)
              if (res.error) window.alert(res.error)
              else onSaved()
            }}
          >
            <Archive className="h-4 w-4" aria-hidden="true" /> Archive
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            busy={busy}
            onClick={async () => {
              if (!customer) return
              if (!f.firstName.trim()) {
                setError("A first name is required.")
                return
              }
              setBusy(true)
              setError(null)
              const res = await updateCustomer(customer.id, {
                first_name: f.firstName.trim(),
                last_name: f.lastName.trim() || null,
                phone: f.phone.trim() || null,
                email: f.email.trim() || null,
                city: f.city.trim() || null,
                alert_note: f.alertNote.trim() || null,
                service_reminders: f.reminders,
              })
              setBusy(false)
              if (res.error) setError(res.error)
              else onSaved()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" required error={error}>
            {(p) => <TextInput {...p} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />}
          </Field>
          <Field label="Last name">
            {(p) => <TextInput {...p} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />}
          </Field>
          <Field label="Phone">
            {(p) => <TextInput {...p} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}
          </Field>
          <Field label="Email">
            {(p) => <TextInput {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
          </Field>
        </div>
        <Field label="City">
          {(p) => <TextInput {...p} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />}
        </Field>
        <Field label="Alert note" hint="Shown on their record every time it is opened.">
          {(p) => (
            <TextInput
              {...p}
              value={f.alertNote}
              onChange={(e) => setF({ ...f, alertNote: e.target.value })}
              placeholder="Account on hold — see practice manager"
            />
          )}
        </Field>
        <label className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-[12.5px]">
          <input
            type="checkbox"
            checked={f.reminders}
            onChange={(e) => setF({ ...f, reminders: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold text-foreground">Send service reminders</span>
            <span className="block text-muted-foreground">
              Vaccination and follow-up reminders. Turning this off suppresses them everywhere at once.
            </span>
          </span>
        </label>
        {customer?.isLinked && (
          <p className="rounded-xl bg-accent/10 p-3 text-[11.5px] text-muted-foreground">
            This customer has a Pet10x account. Reminders reach them as a free notification they can book from.
          </p>
        )}
      </div>
    </Modal>
  )
}

function AddAnimalModal({
  customer, businessId, onClose, onSaved,
}: {
  customer: ClinicCustomer | null
  businessId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({ name: "", species: "dog", breed: "", dob: "", microchip: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal
      open={customer !== null}
      onClose={onClose}
      title={customer ? `Add an animal for ${customer.fullName}` : "Add an animal"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            busy={busy}
            onClick={async () => {
              if (!customer) return
              setBusy(true)
              setError(null)
              const res = await addPatientToCustomer(businessId, customer.id, {
                name: f.name,
                species: f.species as "dog",
                breed: f.breed,
                dob: f.dob,
                microchip: f.microchip,
              })
              setBusy(false)
              if (res.error) setError(res.error)
              else {
                setF({ name: "", species: "dog", breed: "", dob: "", microchip: "" })
                onSaved()
              }
            }}
          >
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Name" required error={error}>
          {(p) => <TextInput {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Species">
            {(p) => (
              <Select {...p} value={f.species} onChange={(e) => setF({ ...f, species: e.target.value })}>
                <option value="dog">Dog</option>
                <option value="cat">Cat</option>
                <option value="bird">Bird</option>
                <option value="small_mammal">Small mammal</option>
                <option value="reptile">Reptile</option>
                <option value="fish">Fish</option>
                <option value="other">Other</option>
              </Select>
            )}
          </Field>
          <Field label="Breed">
            {(p) => <TextInput {...p} value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })} />}
          </Field>
          <Field label="Date of birth">
            {(p) => <TextInput {...p} type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} />}
          </Field>
          <Field label="Microchip">
            {(p) => <TextInput {...p} value={f.microchip} onChange={(e) => setF({ ...f, microchip: e.target.value })} />}
          </Field>
        </div>
      </div>
    </Modal>
  )
}
