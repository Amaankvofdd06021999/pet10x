"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { toast } from "sonner"
import {
  ArrowLeft,
  Camera,
  Edit3,
  Plus,
  Trash2,
  Syringe,
  FileText,
  Phone,
  Calendar,
  Weight,
  Dna,
  Palette,
  Loader2,
  ExternalLink,
  Check,
  X,
} from "lucide-react"
import {
  usePet,
  usePetVaccinations,
  usePetDocuments,
  usePetEmergencyContacts,
  updatePet,
  setPetPhoto,
  addPetVaccination,
  deletePetVaccination,
  addPetDocument,
  deletePetDocument,
  addPetContact,
  deletePetContact,
  type PetDocKind,
  type PetStatus,
} from "@/lib/data"
import { petFileSignedUrl } from "@/lib/supabase/storage"

type DetailTab = "overview" | "vaccinations" | "documents" | "contacts"

const STATUSES: { value: PetStatus; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "away", label: "Away" },
  { value: "at-vet", label: "At Vet" },
  { value: "vacation", label: "Vacation" },
]

const DOC_KINDS: { value: PetDocKind; label: string }[] = [
  { value: "municipal_license", label: "License" },
  { value: "liability_insurance", label: "Insurance" },
  { value: "microchip_registration", label: "Microchip" },
  { value: "building_registration", label: "Registration" },
  { value: "esa_letter", label: "ESA letter" },
  { value: "other", label: "Other" },
]

function statusBadge(status: string): string {
  switch (status) {
    case "current":
    case "active":
    case "approved":
      return "bg-success/10 text-success"
    case "expiring":
      return "bg-[#FFF9E6] text-[#B38F00]"
    case "expired":
    case "rejected":
    case "missing":
      return "bg-destructive/10 text-destructive"
    default:
      return "bg-muted text-muted-foreground"
  }
}

interface PetDetailScreenProps {
  onBack: () => void
  petId?: string
}

export function PetDetailScreen({ onBack, petId }: PetDetailScreenProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview")
  const { data: pet, isLoading, refetch } = usePet(petId)
  const photoInput = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [editing, setEditing] = useState(false)

  if (isLoading && !pet) {
    return (
      <Shell onBack={onBack}>
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    )
  }
  if (!pet) {
    return (
      <Shell onBack={onBack}>
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <p className="text-[15px] font-semibold text-foreground">Pet not found</p>
          <button onClick={onBack} className="mt-3 text-[14px] font-medium text-primary">
            Go back
          </button>
        </div>
      </Shell>
    )
  }

  async function onPhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !pet) return
    setUploadingPhoto(true)
    const { error } = await setPetPhoto(pet.id, file)
    setUploadingPhoto(false)
    if (error) toast.error("Photo upload failed", { description: error })
    else {
      toast.success("Photo updated")
      refetch()
    }
  }

  async function setStatus(status: PetStatus) {
    if (!pet) return
    const { error } = await updatePet(pet.id, { status })
    if (error) toast.error("Couldn't update status", { description: error })
    else {
      toast.success(`Status set to ${STATUSES.find((s) => s.value === status)?.label}`)
      refetch()
    }
  }

  return (
    <Shell
      onBack={onBack}
      action={
        !editing && (
          <button onClick={() => setEditing(true)} className="p-2 text-primary" aria-label="Edit pet">
            <Edit3 className="h-5 w-5" />
          </button>
        )
      }
    >
      <main className="ios-scroll flex-1 pb-24">
        {/* Hero */}
        <div className="relative h-60 w-full bg-muted">
          <Image src={pet.image} alt={pet.name} fill className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
          <button
            onClick={() => photoInput.current?.click()}
            disabled={uploadingPhoto}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-card/85 backdrop-blur-sm transition-transform active:scale-95"
            aria-label="Change photo"
          >
            {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4 text-foreground" />}
          </button>
          <input ref={photoInput} type="file" accept="image/*" onChange={onPhotoPick} className="hidden" />
          <div className="absolute bottom-4 left-4 right-4">
            <h1 className="text-[32px] font-bold text-foreground">{pet.name}</h1>
            <p className="text-[15px] text-muted-foreground">{pet.breed || "Pet"}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="sticky top-[44px] z-30 bg-background px-4 py-3">
          <div className="flex rounded-xl bg-muted p-1">
            {(["overview", "vaccinations", "documents", "contacts"] as DetailTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab)
                  setEditing(false)
                }}
                className={`flex-1 rounded-lg py-2 text-[12px] font-semibold capitalize transition-all ${
                  activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4">
          {activeTab === "overview" &&
            (editing ? (
              <EditForm pet={pet} onDone={() => setEditing(false)} onSaved={refetch} />
            ) : (
              <OverviewTab pet={pet} onStatus={setStatus} />
            ))}
          {activeTab === "vaccinations" && <VaccinationsTab petId={pet.id} />}
          {activeTab === "documents" && <DocumentsTab petId={pet.id} />}
          {activeTab === "contacts" && <ContactsTab petId={pet.id} />}
        </div>
      </main>
    </Shell>
  )
}

/* ------------------------------- Overview ------------------------------- */

function OverviewTab({ pet, onStatus }: { pet: ReturnType<typeof usePet>["data"]; onStatus: (s: PetStatus) => void }) {
  if (!pet) return null
  const m = pet.medical
  const info = [
    { icon: Calendar, label: "Age", value: pet.age || "—" },
    { icon: Weight, label: "Weight", value: pet.weight || "—" },
    { icon: Dna, label: "Gender", value: `${pet.gender || "—"}${pet.neutered ? " · Neutered" : ""}` },
    { icon: Palette, label: "Color", value: pet.color || "—" },
  ]
  const medicalRows = [
    ["Conditions", m?.conditions],
    ["Medications", m?.medications],
    ["Allergies", m?.allergies],
    ["Behavioral notes", m?.behavioralNotes],
  ] as const
  const hasVet = m?.vetClinic || m?.vetName || m?.vetPhone

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {info.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-[12px] font-medium text-muted-foreground">{item.label}</span>
              </div>
              <p className="mt-1 text-[13px] font-semibold text-foreground">{item.value}</p>
            </div>
          )
        })}
      </div>
      {pet.microchip && (
        <div className="rounded-2xl border border-border bg-card p-3">
          <span className="text-[12px] font-medium text-muted-foreground">Microchip</span>
          <p className="mt-0.5 font-mono text-[13px] font-semibold text-foreground">{pet.microchip}</p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-[15px] font-semibold text-foreground">Status</h3>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => onStatus(s.value)}
              className={`rounded-xl py-2 text-[12px] font-semibold transition-all ${
                pet.status === s.value ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-[15px] font-semibold text-foreground">Medical</h3>
        <div className="mt-3 flex flex-col gap-2.5">
          {medicalRows.map(([label, value], i) => (
            <div key={label}>
              {i > 0 && <div className="mb-2.5 h-px bg-border" />}
              <div className="flex items-start justify-between gap-4">
                <span className="flex-shrink-0 text-[13px] text-muted-foreground">{label}</span>
                <span className="text-right text-[13px] text-foreground">{value || "None reported"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {hasVet && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-[15px] font-semibold text-foreground">Veterinarian</h3>
          <p className="mt-2 text-[14px] font-medium text-foreground">{m?.vetClinic || m?.vetName || "—"}</p>
          <p className="text-[12px] text-muted-foreground">
            {[m?.vetName, m?.vetPhone].filter(Boolean).join(" · ") || ""}
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------- Edit form ------------------------------ */

function EditForm({
  pet,
  onDone,
  onSaved,
}: {
  pet: NonNullable<ReturnType<typeof usePet>["data"]>
  onDone: () => void
  onSaved: () => void
}) {
  const m = pet.medical
  const [f, setF] = useState({
    name: pet.name,
    breed: pet.breed,
    dob: pet.dob ?? "",
    gender: pet.gender ?? "Unknown",
    weight: pet.weight ? pet.weight.replace(/[^\d.]/g, "") : "",
    color: pet.color ?? "",
    microchip: pet.microchip ?? "",
    neutered: pet.neutered ?? false,
    conditions: m?.conditions ?? "",
    medications: m?.medications ?? "",
    allergies: m?.allergies ?? "",
    behavioralNotes: m?.behavioralNotes ?? "",
    vetClinic: m?.vetClinic ?? "",
    vetName: m?.vetName ?? "",
    vetPhone: m?.vetPhone ?? "",
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))

  async function save() {
    if (!f.name.trim()) {
      toast.error("Name is required.")
      return
    }
    setSaving(true)
    const weightKg = f.weight ? parseFloat(f.weight) : null
    const { error } = await updatePet(pet.id, {
      name: f.name.trim(),
      breed: f.breed.trim() || null,
      dob: f.dob || null,
      sex: f.gender === "Male" ? "male" : f.gender === "Female" ? "female" : "unknown",
      weightKg: weightKg && !Number.isNaN(weightKg) ? weightKg : null,
      color: f.color.trim() || null,
      microchip: f.microchip.trim() || null,
      neutered: f.neutered,
      conditions: f.conditions.trim() || null,
      medications: f.medications.trim() || null,
      allergies: f.allergies.trim() || null,
      behavioralNotes: f.behavioralNotes.trim() || null,
      vetClinic: f.vetClinic.trim() || null,
      vetName: f.vetName.trim() || null,
      vetPhone: f.vetPhone.trim() || null,
    })
    setSaving(false)
    if (error) {
      toast.error("Couldn't save", { description: error })
      return
    }
    toast.success("Pet updated")
    onSaved()
    onDone()
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField label="Name" value={f.name} onChange={(v) => set("name", v)} />
      <TextField label="Breed" value={f.breed} onChange={(v) => set("breed", v)} />
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Date of birth" value={f.dob} onChange={(v) => set("dob", v)} />
        <TextField label="Weight (kg)" value={f.weight} onChange={(v) => set("weight", v)} type="number" />
      </div>
      <div>
        <Label>Gender</Label>
        <div className="grid grid-cols-3 gap-2">
          {["Male", "Female", "Unknown"].map((g) => (
            <button
              key={g}
              onClick={() => set("gender", g)}
              className={`rounded-xl border py-2 text-[13px] font-semibold transition-all ${
                f.gender === g ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Color" value={f.color} onChange={(v) => set("color", v)} />
        <TextField label="Microchip" value={f.microchip} onChange={(v) => set("microchip", v)} />
      </div>
      <label className="flex items-center justify-between rounded-xl border border-border bg-card p-3.5">
        <span className="text-[14px] font-medium text-foreground">Spayed / Neutered</span>
        <button
          role="switch"
          aria-checked={f.neutered}
          onClick={() => set("neutered", !f.neutered)}
          className={`relative h-7 w-12 rounded-full transition-colors ${f.neutered ? "bg-success" : "bg-muted"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-card shadow transition-transform ${f.neutered ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </label>

      <p className="mt-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Medical</p>
      <TextField label="Conditions" value={f.conditions} onChange={(v) => set("conditions", v)} />
      <TextField label="Medications" value={f.medications} onChange={(v) => set("medications", v)} />
      <TextField label="Allergies" value={f.allergies} onChange={(v) => set("allergies", v)} />
      <TextField label="Behavioral notes" value={f.behavioralNotes} onChange={(v) => set("behavioralNotes", v)} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Vet clinic" value={f.vetClinic} onChange={(v) => set("vetClinic", v)} />
        <TextField label="Vet name" value={f.vetName} onChange={(v) => set("vetName", v)} />
      </div>
      <TextField label="Vet phone" value={f.vetPhone} onChange={(v) => set("vetPhone", v)} />

      <div className="mt-2 flex gap-2">
        <button
          onClick={onDone}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-3 text-[15px] font-semibold text-foreground"
        >
          <X className="h-4 w-4" /> Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
        </button>
      </div>
    </div>
  )
}

/* ----------------------------- Vaccinations ----------------------------- */

function VaccinationsTab({ petId }: { petId: string }) {
  const { data: vax, isLoading, refetch } = usePetVaccinations(petId)
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: "", givenOn: "", expiresOn: "" })
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!f.name.trim()) {
      toast.error("Vaccine name is required.")
      return
    }
    setSaving(true)
    const { error } = await addPetVaccination({ petId, name: f.name.trim(), givenOn: f.givenOn || null, expiresOn: f.expiresOn || null })
    setSaving(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success("Vaccination added")
    setF({ name: "", givenOn: "", expiresOn: "" })
    setAdding(false)
    refetch()
  }

  async function remove(id: string) {
    const { error } = await deletePetVaccination(id)
    if (error) return toast.error("Couldn't remove", { description: error })
    toast("Vaccination removed")
    refetch()
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Vaccinations" onAdd={() => setAdding((v) => !v)} adding={adding} />
      {adding && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3.5">
          <TextField label="Vaccine" value={f.name} onChange={(v) => setF((p) => ({ ...p, name: v }))} placeholder="Rabies, DHPP…" />
          <div className="grid grid-cols-2 gap-3">
            <DateField label="Given" value={f.givenOn} onChange={(v) => setF((p) => ({ ...p, givenOn: v }))} />
            <DateField label="Expires" value={f.expiresOn} onChange={(v) => setF((p) => ({ ...p, expiresOn: v }))} />
          </div>
          <SaveRow saving={saving} onSave={add} onCancel={() => setAdding(false)} />
        </div>
      )}
      {isLoading ? (
        <Spinner />
      ) : vax.length === 0 ? (
        <Empty icon={Syringe} text="No vaccinations recorded" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {vax.map((v, i) => (
            <div key={v.id} className={`flex items-center gap-3 p-3.5 ${i < vax.length - 1 ? "border-b border-border" : ""}`}>
              <Syringe className="h-5 w-5 flex-shrink-0 text-success" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-foreground">{v.name}</p>
                <p className="text-[12px] text-muted-foreground">
                  {v.givenOn ? `Given ${v.givenOn}` : "Given —"}
                  {v.expiresOn ? ` · Expires ${v.expiresOn}` : ""}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadge(v.status)}`}>{v.status}</span>
              <DeleteBtn onClick={() => remove(v.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------- Documents ------------------------------ */

function DocumentsTab({ petId }: { petId: string }) {
  const { data: docs, isLoading, refetch } = usePetDocuments(petId)
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState<{ kind: PetDocKind; name: string; expiresOn: string; file: File | null }>({
    kind: "municipal_license",
    name: "",
    expiresOn: "",
    file: null,
  })
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function add() {
    setSaving(true)
    const { error } = await addPetDocument({
      petId,
      kind: f.kind,
      name: f.name.trim() || DOC_KINDS.find((d) => d.value === f.kind)?.label,
      file: f.file ?? undefined,
      expiresOn: f.expiresOn || null,
    })
    setSaving(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success("Document added")
    setF({ kind: "municipal_license", name: "", expiresOn: "", file: null })
    setAdding(false)
    refetch()
  }

  async function view(path: string | null) {
    if (!path) return toast("No file attached")
    const url = await petFileSignedUrl(path)
    if (url) window.open(url, "_blank")
    else toast.error("Couldn't open file")
  }

  async function remove(doc: (typeof docs)[number]) {
    const { error } = await deletePetDocument(doc)
    if (error) return toast.error("Couldn't remove", { description: error })
    toast("Document removed")
    refetch()
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Documents" onAdd={() => setAdding((v) => !v)} adding={adding} />
      {adding && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3.5">
          <div>
            <Label>Type</Label>
            <div className="flex flex-wrap gap-2">
              {DOC_KINDS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setF((p) => ({ ...p, kind: d.value }))}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    f.kind === d.value ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <TextField label="Name" value={f.name} onChange={(v) => setF((p) => ({ ...p, name: v }))} placeholder="Optional label" />
          <DateField label="Expires (optional)" value={f.expiresOn} onChange={(v) => setF((p) => ({ ...p, expiresOn: v }))} />
          <div>
            <Label>File</Label>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-background px-3.5 py-2.5 text-[13px] text-muted-foreground"
            >
              <FileText className="h-4 w-4" />
              {f.file ? f.file.name : "Attach image or PDF"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setF((p) => ({ ...p, file: e.target.files?.[0] ?? null }))}
              className="hidden"
            />
          </div>
          <SaveRow saving={saving} onSave={add} onCancel={() => setAdding(false)} />
        </div>
      )}
      {isLoading ? (
        <Spinner />
      ) : docs.length === 0 ? (
        <Empty icon={FileText} text="No documents uploaded" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-foreground">
                  {doc.name || DOC_KINDS.find((d) => d.value === doc.kind)?.label || "Document"}
                </p>
                <p className="text-[12px] text-muted-foreground">{doc.expiresOn ? `Expires ${doc.expiresOn}` : "No expiry"}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadge(doc.status)}`}>{doc.status}</span>
              {doc.storagePath && (
                <button onClick={() => view(doc.storagePath)} className="p-1.5 text-primary" aria-label="View document">
                  <ExternalLink className="h-4 w-4" />
                </button>
              )}
              <DeleteBtn onClick={() => remove(doc)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------- Contacts ------------------------------- */

function ContactsTab({ petId }: { petId: string }) {
  const { data: contacts, isLoading, refetch } = usePetEmergencyContacts(petId)
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ role: "", name: "", phone: "" })
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!f.name.trim() || !f.phone.trim()) {
      toast.error("Name and phone are required.")
      return
    }
    setSaving(true)
    const { error } = await addPetContact({ petId, role: f.role.trim() || "Contact", name: f.name.trim(), phone: f.phone.trim() })
    setSaving(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success("Contact added")
    setF({ role: "", name: "", phone: "" })
    setAdding(false)
    refetch()
  }

  async function remove(id: string) {
    const { error } = await deletePetContact(id)
    if (error) return toast.error("Couldn't remove", { description: error })
    toast("Contact removed")
    refetch()
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Emergency contacts" onAdd={() => setAdding((v) => !v)} adding={adding} />
      {adding && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3.5">
          <TextField label="Role" value={f.role} onChange={(v) => setF((p) => ({ ...p, role: v }))} placeholder="Vet, sitter, owner…" />
          <TextField label="Name" value={f.name} onChange={(v) => setF((p) => ({ ...p, name: v }))} />
          <TextField label="Phone" value={f.phone} onChange={(v) => setF((p) => ({ ...p, phone: v }))} type="tel" />
          <SaveRow saving={saving} onSave={add} onCancel={() => setAdding(false)} />
        </div>
      )}
      {isLoading ? (
        <Spinner />
      ) : contacts.length === 0 ? (
        <Empty icon={Phone} text="No emergency contacts" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {contacts.map((c, i) => (
            <div key={c.id} className={`flex items-center gap-3 p-3.5 ${i < contacts.length - 1 ? "border-b border-border" : ""}`}>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-foreground">{c.name}</p>
                <p className="text-[12px] text-muted-foreground">{c.role}</p>
              </div>
              <a href={`tel:${c.phone}`} className="text-[13px] font-medium text-primary">
                {c.phone}
              </a>
              <DeleteBtn onClick={() => remove(c.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------- Primitives ----------------------------- */

function Shell({ children, onBack, action }: { children: React.ReactNode; onBack: () => void; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 bg-card/80 pt-safe backdrop-blur-xl">
        <div className="flex h-11 items-center justify-between px-4">
          <button onClick={onBack} className="flex items-center gap-1 text-primary">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[17px]">Back</span>
          </button>
          {action}
        </div>
      </header>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-[14px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  )
}

function SectionHeader({ title, onAdd, adding }: { title: string; onAdd: () => void; adding: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      <button onClick={onAdd} className="flex items-center gap-1 text-[13px] font-semibold text-primary">
        {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {adding ? "Close" : "Add"}
      </button>
    </div>
  )
}

function SaveRow({ saving, onSave, onCancel }: { saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex gap-2">
      <button onClick={onCancel} className="flex-1 rounded-xl border border-border bg-card py-2.5 text-[14px] font-semibold text-foreground">
        Cancel
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
      </button>
    </div>
  )
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Remove" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted">
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function Empty({ icon: Icon, text }: { icon: typeof Syringe; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-7 text-center">
      <Icon className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-[13px] text-muted-foreground">{text}</p>
    </div>
  )
}
