"use client"

import { Button } from "@/components/ui/button"
import { useId, useRef, useState } from "react"
import { useMyBuildingLink } from "@/lib/data"
import { OTHER_SPECIES, OTHER_BREED, breedsFor, addPet, setPetPhoto } from "@/lib/data"
import type { Species } from "@/lib/data"
import { toast } from "sonner"
import { isDirty } from "@/lib/unsaved"
import { userError } from "@/lib/user-error"
import { useUnsavedGuard } from "@/components/use-unsaved-guard"
import { WeightInput, useWeightField } from "@/components/screens/pet/weight-input"
import { RequiredTag } from "@/components/screens/pet/required-tag"
import { SpeciesTiles } from "@/components/screens/pet/species-tiles"
import { Switch } from "@/components/ui/switch"
import {
  SIZE_BANDS,
  MAX_HEIGHT_INCHES,
  inchesToCm,
  restraintsFor,
  sizeAppliesTo,
  sizeChartAppliesTo,
} from "@/lib/data/pet-attributes"
import {
  ArrowLeft,
  ImagePlus,
  CheckCircle2,
  Loader2,
  Utensils,
  ChevronDown,
} from "lucide-react"

interface AddPetScreenProps {
  onBack: () => void
  onNavigate?: (screen: string) => void
}

/** The success view lives out here and the form is keyed on `round`, so "Add
    another pet" remounts it: every field, the weight hook and the unsaved-guard
    baseline start over together, with nothing to remember to reset. */
export function AddPetScreen({ onBack, onNavigate }: AddPetScreenProps) {
  // The resident's OWN approved link, not `user.building`: that falls back to a
  // manager's primary building, but a pet is attached to a building only
  // through an approved resident link, so a manager's pet has nobody to review it.
  const { data: link } = useMyBuildingLink()
  const reviewer = link?.status === "approved" ? link.buildingName : null
  const [round, setRound] = useState(0)
  const [addedName, setAddedName] = useState<string | null>(null)

  if (addedName !== null) {
    const name = addedName
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <h1 className="text-heading font-semibold text-foreground">{name} is all set! 🐾</h1>
          <p className="mt-3 max-w-sm text-body leading-relaxed text-muted-foreground">
            {reviewer
              ? `Saved to your account — and shared with ${reviewer} for approval. Let's set up their daily care.`
              : `Saved to your account. Let's set up ${name}'s food, medicine and treats.`}
          </p>
          <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
            <Button size="lg" onClick={() => onNavigate?.("pet-care")} className="w-full">
              <Utensils className="h-5 w-5" />{" "}
              Set up food &amp; care
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
 setAddedName(null)
 setRound((n) => n + 1)
 }}
              className="w-full"
            >
              Add another pet
            </Button>
            <button onClick={onBack} className="w-full py-2 text-body font-semibold text-muted-foreground">
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <AddPetForm key={round} onBack={onBack} onSaved={setAddedName} reviewed={reviewer !== null} />
}

function AddPetForm({
  onBack,
  onSaved,
  reviewed,
}: {
  onBack: () => void
  onSaved: (name: string) => void
  /** The resident has an approved building link, so management reviews the pet. */
  reviewed: boolean
}) {
  const ids = useId()
  const id = (field: string) => `${ids}-${field}`
  const [saving, setSaving] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [name, setName] = useState("")
  const [species, setSpecies] = useState<Species | null>(null)
  // Breed is picked from a list; `customBreed` only carries the free text the
  // "Other" option reveals, so switching back to a listed breed cannot leave a
  // stale string behind.
  const [breed, setBreed] = useState("")
  const [customBreed, setCustomBreed] = useState("")
  const [sizeBand, setSizeBand] = useState("")
  const [heightIn, setHeightIn] = useState("")
  const [restraints, setRestraints] = useState<string[]>([])
  const [showChart, setShowChart] = useState(false)
  const [dob, setDob] = useState("")
  const [gender, setGender] = useState<"Male" | "Female" | "">("")
  // The unit is not in the dirty baseline: choosing one alone is not an edit.
  const weightField = useWeightField(null)
  const [color, setColor] = useState("")
  const [microchip, setMicrochip] = useState("")
  const [neutered, setNeutered] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  /* Every field, against how the form opens. The shell asks before leaving
     while this is true (Cancel and Back call its guarded `onBack`); the
     success view is a separate component, so its buttons leave freely. */
  const dirty =
    isDirty(
      { neutered: false }, // every other field opens empty
      { name, species, breed, customBreed, sizeBand, heightIn, restraints, dob, gender, weight: weightField.text, color, microchip, neutered, photoFile },
    )
  useUnsavedGuard(dirty)

  /* The weight lives inside the collapsed details, so a bad value must not hide
     its own error. The first time it goes invalid the panel opens (render-time
     state adjustment, once per transition); after that the user may collapse it,
     and the "Check the weight" button below the form is what stays visible. */
  const [wasValid, setWasValid] = useState(true)
  if (wasValid !== weightField.valid) {
    setWasValid(weightField.valid)
    if (!weightField.valid) setDetailsOpen(true)
  }
  const showWeight = () => {
    setDetailsOpen(true)
    // The input is display:none until the panel has opened, so focus after paint.
    setTimeout(() => document.getElementById(id("weight"))?.focus(), 0)
  }

  const breedOptions = breedsFor(species)
  const parsedWeight = weightField.parsed
  const canSubmit = name.trim().length > 0 && species !== null && parsedWeight.ok

  const handleSubmit = async () => {
    if (!canSubmit || saving || !species) return
    setSaving(true)
    const weightKg = parsedWeight.ok ? parsedWeight.kg : null
    const { error, pet } = await addPet({
      name: name.trim(),
      species,
      breed:
        (breedOptions.length === 0 || breed === OTHER_BREED ? customBreed.trim() : breed.trim()) || undefined,
      dob: dob || undefined,
      sex: gender === "Male" ? "male" : gender === "Female" ? "female" : undefined,
      weightKg: weightKg ?? undefined,
      color: color.trim() || undefined,
      microchip: microchip.trim() || undefined,
      neutered,
      sizeBand: sizeBand || undefined,
      // Collected in inches because every size chart is; stored in cm.
      heightCm: heightIn ? inchesToCm(parseFloat(heightIn)) : undefined,
      restraints,
    })
    if (error || !pet) {
      setSaving(false)
      toast.error("Couldn't add pet", { description: userError(error, "Please try again.") ?? "Please try again." })
      return
    }
    if (photoFile) {
      const up = await setPetPhoto(pet.id, photoFile)
      if (up.error) {
        toast("Pet saved — photo upload failed", {
          description: userError(up.error, "Add the photo from the pet's profile."),
        })
      }
    }
    setSaving(false)
    toast.success(`${name} added`, { description: "Saved to your account." })
    onSaved(name)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-card px-4 pt-safe backdrop-blur-xl">
        <div className="flex h-12 items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1 text-foreground" aria-label="Cancel">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-title">Cancel</span>
          </button>
          <h1 className="text-title font-semibold text-foreground">New pet</h1>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className={`text-title font-semibold ${canSubmit && !saving ? "text-foreground" : "text-muted-foreground"}`}
          >
            {saving ? "Saving…" : "Add pet"}
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
              <span className="text-caption text-muted-foreground">Add photo</span>
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
        <Label>Species <RequiredTag /></Label>
        <SpeciesTiles
          value={species}
          onChange={(s) => {
            setSpecies(s)
            // A Labrador is not an option for a cat.
            setBreed("")
            setCustomBreed("")
          }}
        />

        <Field label="Name" required htmlFor={id("name")}>
          <Input id={id("name")} value={name} onChange={setName} placeholder="e.g. Max" />
        </Field>
        {/* Which kind of "other" — bird, reptile, and so on. The tiles stay at
            three so the common case is one tap, and the long tail lives behind
            the one tile that needs it. */}
        {species !== null && species !== "dog" && species !== "cat" && (
          <Field label="Type of pet" required htmlFor={id("type")}>
            <Select
              id={id("type")}
              value={species}
              onChange={(v) => {
                setSpecies(v as Species)
                setBreed("")
                setCustomBreed("")
              }}
              options={OTHER_SPECIES.map((o) => ({ value: o.value, label: o.label }))}
            />
          </Field>
        )}

        {/* Breed from a list rather than free text: several buildings restrict
            by breed, and a rule cannot be applied to "lab", "Labrador" and
            "Lab X" all meaning the same dog. */}
        <Field label="Breed" htmlFor={breedOptions.length > 0 ? id("breed") : id("breed-text")}>
          {breedOptions.length > 0 ? (
            <>
              <Select
                id={id("breed")}
                value={breed}
                onChange={setBreed}
                placeholder="Select a breed"
                options={[
                  ...breedOptions.map((b) => ({ value: b, label: b })),
                  { value: OTHER_BREED, label: "Other / not listed" },
                ]}
              />
              {breed === OTHER_BREED && (
                <div className="mt-2">
                  <Input id={id("breed-text")} label="Breed" value={customBreed} onChange={setCustomBreed} placeholder="Tell us the breed" />
                </div>
              )}
            </>
          ) : (
            <Input id={id("breed-text")} value={customBreed} onChange={setCustomBreed} placeholder="e.g. Holland Lop" />
          )}
        </Field>

        {/* Everything optional, closed by default. Native <details> keeps what was
            typed when it is collapsed; nothing here auto-opens. */}
        <details
          open={detailsOpen}
          onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
          className="group mb-6 rounded-xl border border-border bg-card"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-body font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            More details (optional)
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of birth" htmlFor={id("dob")}>
            <input
              id={id("dob")}
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full rounded-xl border border-input bg-card px-4 py-3 text-body text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <Field label="Weight" htmlFor={id("weight")}>
            <WeightInput id={id("weight")} field={weightField} />
          </Field>
        </div>

        <Label>Gender</Label>
        <div role="group" aria-label="Gender" className="mb-5 grid grid-cols-2 gap-2.5">
          {(["Male", "Female"] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={gender === g}
              onClick={() => setGender(g)}
              className={`rounded-xl border-2 py-2.5 text-body font-semibold transition-all active:scale-[0.98] ${
                gender === g ? "border-primary bg-primary-soft text-foreground" : "border-border bg-card text-foreground"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Unit lived here and was never saved — it was not in the payload at
            all, so every value typed into it was discarded. It belongs to the
            resident, not the pet: one person in one unit may have three pets,
            and asking three times invites three answers. It is on the profile
            now. */}
        <Field label="Colour or markings" htmlFor={id("color")}>
          <Input id={id("color")} value={color} onChange={setColor} placeholder="e.g. Golden" />
        </Field>

        <Field label="Microchip number" htmlFor={id("microchip")}>
          <Input id={id("microchip")} value={microchip} onChange={setMicrochip} placeholder="Optional" />
        </Field>

        {/* Size only where it means something. Height at the shoulder is dog
            vocabulary; a building's size rule is about animals in lifts and
            corridors, and a fish has neither a shoulder nor a corridor. */}
        {sizeAppliesTo(species) && (
        <>
        {/* Size — recorded, never enforced. A building may cap size in its
            bylaws, and the manager is shown when a pet exceeds it, but a
            resident whose large dog already lives there must still be able to
            register it or the register stops describing the building. */}
        <Field label="Size">
          <div role="group" aria-label="Size" className="flex flex-wrap gap-1.5">
            {SIZE_BANDS.map((b) => (
              <Button
                variant={sizeBand === b.id ? "primary" : "secondary"}
                size="sm"
                key={b.id}
                type="button"
                aria-pressed={sizeBand === b.id}
                onClick={() => setSizeBand(sizeBand === b.id ? "" : b.id)}
              >
                {b.label}
              </Button>
            ))}
            {sizeChartAppliesTo(species) && (
              <button
                type="button"
                onClick={() => setShowChart((v) => !v)}
                className="rounded-full px-3 py-1.5 text-caption font-semibold text-foreground"
              >
                {showChart ? "Hide chart" : "Size chart"}
              </button>
            )}
          </div>
          {showChart && (
            <div className="mt-2 overflow-hidden rounded-xl border border-border">
              {SIZE_BANDS.map((b, i) => (
                <div
                  key={b.id}
                  className={`flex items-baseline gap-2 px-3 py-2 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <span className="w-16 flex-shrink-0 text-caption font-semibold text-foreground">{b.label}</span>
                  <span className="w-20 flex-shrink-0 text-caption text-muted-foreground">{b.range}</span>
                  <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">{b.examples}</span>
                </div>
              ))}
              <p className="border-t border-border bg-muted px-3 py-2 text-caption leading-relaxed text-muted-foreground">
                Measured at the shoulder. Buildings commonly cap at {MAX_HEIGHT_INCHES} in — we record the size
                and let your manager review it rather than blocking registration.
              </p>
            </div>
          )}
        </Field>

        {sizeChartAppliesTo(species) && (
          <Field label="Height at shoulder" htmlFor={id("height")}>
            <div className="relative">
              <Input id={id("height")} value={heightIn} onChange={setHeightIn} placeholder="Optional, e.g. 20" />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-caption font-medium text-muted-foreground">
                inches
              </span>
            </div>
          </Field>
        )}
        </>
        )}

        {/* Several apply at once — harnessed AND muzzled is a normal answer. The
            hint is visible text, not a `title`: a tooltip never shows on touch. */}
        <Field label="In common areas">
          <div role="group" aria-label="In common areas" className="flex flex-col gap-2">
            {restraintsFor(species).map((r) => {
              const on = restraints.includes(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setRestraints(on ? restraints.filter((x) => x !== r.id) : [...restraints, r.id])
                  }
                  className={`rounded-xl border-2 px-4 py-2.5 text-left transition-colors ${
                    on ? "border-primary bg-primary-soft" : "border-border bg-card"
                  }`}
                >
                  <span className={`block text-body font-semibold ${on ? "text-foreground" : "text-foreground"}`}>
                    {r.label}
                  </span>
                  <span className="block text-caption text-muted-foreground">{r.hint}</span>
                </button>
              )
            })}
          </div>
        </Field>

        {/* The whole row is the label, so tapping anywhere on it flips the switch. */}
        <label
          htmlFor={id("neutered")}
          className="mb-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl card-raised p-4"
        >
          <div>
            <p className="text-body font-medium text-foreground">Spayed or neutered</p>
            <p className="text-caption text-muted-foreground">Some buildings ask for this</p>
          </div>
          <Switch id={id("neutered")} checked={neutered} onCheckedChange={setNeutered} />
        </label>
          </div>
        </details>

        {!weightField.valid && (
          <button
            type="button"
            onClick={showWeight}
            className="mb-3 w-full text-center text-meta font-semibold text-foreground underline"
          >
            Check the weight under More details
          </button>
        )}
        <Button
          variant={canSubmit && !saving ? "primary" : "secondary"}
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit || saving}
          className="w-full"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Add pet"}
        </Button>
        {/* Only for a resident with an approved building link; anyone else has
            no management to review the pet, so the line would be untrue. */}
        {reviewed && (
          <p className="mt-3 text-center text-caption leading-relaxed text-muted-foreground">
            Your building&apos;s management will review this pet.
          </p>
        )}
      </main>
    </div>
  )
}

/* tiny form primitives */
function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-meta font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
}
/** A real <label htmlFor> so tapping the words focuses the control and a screen reader names it. */
function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string
  required?: boolean
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <label
        htmlFor={htmlFor}
        className="mb-2 flex items-center gap-1.5 text-meta font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
        {required && <RequiredTag />}
      </label>
      {children}
    </div>
  )
}
function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-input bg-card px-4 py-3 pr-10 text-body text-foreground outline-none focus:border-primary"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

function Input({ id, label, value, onChange, placeholder }: { id?: string; label?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      id={id}
      aria-label={label}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-input bg-card px-4 py-3 text-body text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
    />
  )
}
