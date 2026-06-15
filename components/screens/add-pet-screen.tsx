"use client"

import { useRef, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { addPet, setPetPhoto } from "@/lib/data"
import { toast } from "sonner"
import { ArrowLeft, ImagePlus, Dog, Cat, PawPrint, CheckCircle2, Loader2, Utensils } from "lucide-react"

type Species = "dog" | "cat" | "other"

const SPECIES: { id: Species; label: string; icon: typeof Dog }[] = [
  { id: "dog", label: "Dog", icon: Dog },
  { id: "cat", label: "Cat", icon: Cat },
  { id: "other", label: "Other", icon: PawPrint },
]

interface AddPetScreenProps {
  onBack: () => void
  onNavigate?: (screen: string) => void
}

export function AddPetScreen({ onBack, onNavigate }: AddPetScreenProps) {
  const { user } = useAuth()
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [species, setSpecies] = useState<Species | null>(null)
  const [breed, setBreed] = useState("")
  const [dob, setDob] = useState("")
  const [gender, setGender] = useState<"Male" | "Female" | "">("")
  const [weight, setWeight] = useState("")
  const [color, setColor] = useState("")
  const [microchip, setMicrochip] = useState("")
  const [neutered, setNeutered] = useState(false)
  const [unit, setUnit] = useState(user?.unit ?? "")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  const canSubmit = name.trim().length > 0 && species !== null

  const handleSubmit = async () => {
    if (!canSubmit || saving || !species) return
    setSaving(true)
    const weightKg = weight ? parseFloat(weight.replace(/[^\d.]/g, "")) : undefined
    const { error, pet } = await addPet({
      name: name.trim(),
      species,
      breed: breed.trim() || undefined,
      dob: dob || undefined,
      sex: gender === "Male" ? "male" : gender === "Female" ? "female" : undefined,
      weightKg: weightKg && !Number.isNaN(weightKg) ? weightKg : undefined,
      color: color.trim() || undefined,
      microchip: microchip.trim() || undefined,
      neutered,
    })
    if (error || !pet) {
      setSaving(false)
      toast.error("Couldn't add pet", { description: error ?? "Please try again." })
      return
    }
    if (photoFile) {
      const up = await setPetPhoto(pet.id, photoFile)
      if (up.error) toast("Pet saved — photo upload failed", { description: up.error })
    }
    setSaving(false)
    toast.success(`${name} added`, { description: "Saved to your account." })
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <h1 className="text-[24px] font-semibold text-foreground">{name} is all set! 🐾</h1>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            {user?.building
              ? `Saved to your account — and shared with ${user.building} for approval. Let's set up their daily care.`
              : `Saved to your account. Let's set up ${name}'s food, medicine and treats.`}
          </p>
          <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
            <button
              onClick={() => onNavigate?.("pet-care")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-[16px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              <Utensils className="h-5 w-5" /> Set up food &amp; care
            </button>
            <button
              onClick={() => {
                setSubmitted(false)
                setName(""); setSpecies(null); setBreed(""); setDob(""); setGender(""); setWeight(""); setColor(""); setMicrochip(""); setNeutered(false)
                setPhotoFile(null); setPhotoPreview(null)
              }}
              className="w-full rounded-xl border border-border py-3.5 text-[16px] font-semibold text-foreground transition-transform active:scale-[0.98]"
            >
              Add another pet
            </button>
            <button onClick={onBack} className="w-full py-2 text-[15px] font-semibold text-muted-foreground">
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 px-4 pt-safe backdrop-blur-xl">
        <div className="flex h-12 items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1 text-primary" aria-label="Cancel">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[17px]">Cancel</span>
          </button>
          <h1 className="text-[17px] font-semibold text-foreground">Add Pet</h1>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className={`text-[17px] font-semibold ${canSubmit && !saving ? "text-primary" : "text-muted-foreground/50"}`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <main className="ios-scroll flex-1 px-4 pb-28 pt-5">
        {/* Photo */}
        <button
          onClick={() => photoInput.current?.click()}
          className="mx-auto mb-6 flex h-24 w-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card transition-colors hover:bg-muted"
        >
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="Pet preview" className="h-full w-full object-cover" />
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Add photo</span>
            </>
          )}
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            setPhotoFile(file)
            setPhotoPreview(file ? URL.createObjectURL(file) : null)
          }}
          className="hidden"
        />

        {/* Species */}
        <Label>Species <Req /></Label>
        <div className="mb-5 grid grid-cols-3 gap-2.5">
          {SPECIES.map((s) => {
            const Icon = s.icon
            const active = species === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSpecies(s.id)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all active:scale-[0.97] ${
                  active ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
              >
                <Icon className={`h-6 w-6 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[13px] font-semibold ${active ? "text-primary" : "text-foreground"}`}>{s.label}</span>
              </button>
            )
          })}
        </div>

        <Field label="Name" required>
          <Input value={name} onChange={setName} placeholder="e.g. Max" />
        </Field>
        <Field label="Breed">
          <Input value={breed} onChange={setBreed} placeholder="e.g. Golden Retriever" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of birth">
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-[15px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </Field>
          <Field label="Weight">
            <Input value={weight} onChange={setWeight} placeholder="e.g. 32 kg" />
          </Field>
        </div>

        <Label>Gender</Label>
        <div className="mb-5 grid grid-cols-2 gap-2.5">
          {(["Male", "Female"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`rounded-xl border-2 py-2.5 text-[14px] font-semibold transition-all active:scale-[0.98] ${
                gender === g ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Color / markings">
            <Input value={color} onChange={setColor} placeholder="e.g. Golden" />
          </Field>
          <Field label="Unit">
            <Input value={unit} onChange={setUnit} placeholder="e.g. 2104" />
          </Field>
        </div>

        <Field label="Microchip number">
          <Input value={microchip} onChange={setMicrochip} placeholder="Optional" />
        </Field>

        {/* Neutered */}
        <label className="mb-6 flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <p className="text-[15px] font-medium text-foreground">Spayed / Neutered</p>
            <p className="text-[12px] text-muted-foreground">Helps with building compliance</p>
          </div>
          <div
            role="switch"
            aria-checked={neutered}
            onClick={() => setNeutered((v) => !v)}
            className={`relative h-7 w-12 rounded-full transition-colors ${neutered ? "bg-success" : "bg-muted"}`}
          >
            <div className={`absolute top-0.5 h-6 w-6 rounded-full bg-card shadow transition-transform ${neutered ? "translate-x-5" : "translate-x-0.5"}`} />
          </div>
        </label>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || saving}
          className={`flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-[16px] font-semibold transition-all active:scale-[0.98] ${
            canSubmit && !saving ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Register pet"}
        </button>
        <p className="mt-3 text-center text-[12px] leading-relaxed text-muted-foreground">
          Your pet will be submitted to building management for approval before appearing as registered.
        </p>
      </main>
    </div>
  )
}

/* tiny form primitives */
function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
}
function Req() {
  return <span className="text-destructive">*</span>
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <Label>
        {label} {required && <Req />}
      </Label>
      {children}
    </div>
  )
}
function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-border bg-card px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
    />
  )
}
