"use client"

import { ErrorText } from "@/components/ui/error-text"
import { Button } from "@/components/ui/button"
import { useId, useRef, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { OTHER_SPECIES, addPet, nextStepAfterPet, requestBuildingLink, setPetPhoto, useMyCompleteness, usePets } from "@/lib/data"
import type { Gap, Species } from "@/lib/data"
import { setMyUnit } from "@/lib/data/account"
import { routeToSearch } from "@/lib/app-route"
import { PERSONA_LABEL } from "@/lib/rbac"
import { existingPetForDone, type DonePet } from "@/lib/onboarding-pet"
import { userError } from "@/lib/user-error"
import { SpeciesTiles } from "@/components/screens/pet/species-tiles"
import { RequiredTag } from "@/components/screens/pet/required-tag"
import { toast } from "sonner"
import {
  PawPrint,
  Building2,
  ArrowLeft,
  KeyRound,
  Loader2,
  CheckCircle2,
  Share2,
  Sparkles,
  ImagePlus,
  Dog,
  Cat,
} from "lucide-react"
import { historyStateWithout } from "@/lib/history-state"

/* "unit" sits between code and linked: the manager needs a unit to place the
   request, and asking later means the request lands incomplete and has to be
   chased. Asked once, here, while they are already thinking about it.

   "pet" and "done" close every path. The flow used to promise to "add you and
   your pet", never asked about the pet, and dropped a new owner on a busy Home
   with nothing of theirs on it. */
type Step = "intro" | "code" | "unit" | "linked" | "standalone" | "pet" | "done"

/** What the done screen's pet card shows; the photo is the local preview. */
type AddedPet = DonePet

export function OnboardingFlow() {
  const { user, markOnboarded, personas, setActivePersona } = useAuth()
  const [step, setStep] = useState<Step>("intro")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [linkedBuilding, setLinkedBuilding] = useState("")
  const [unit, setUnit] = useState("")
  const [petName, setPetName] = useState("")
  const [species, setSpecies] = useState<Species | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [addedPet, setAddedPet] = useState<AddedPet | null>(null)
  /* Onboarding running again for an owner who already has a pet (the
     onboarded flag failed to save last time) skips the pet step: derived, not
     an effect, so it holds even if their pets arrive after "Continue". */
  const { data: pets } = usePets()
  const existingPet = existingPetForDone(pets)
  const shownStep: Step = step === "pet" && existingPet ? "done" : step
  const donePet = addedPet ?? existingPet
  const photoInput = useRef<HTMLInputElement>(null)
  const petNameId = useId()
  const firstName = (user?.name || "there").split(" ")[0]

  /* Every step change goes through here. `error` and `loading` are shared by
     all steps, so a message left by one ("Couldn't link to that building")
     would otherwise surface as an alert on the next. */
  function goTo(next: Step) {
    setError(null)
    setLoading(false)
    setStep(next)
  }

  async function linkBuilding() {
    setError(null)
    if (!code.trim()) {
      setError("Enter your building code.")
      return
    }
    setLoading(true)
    const res = await requestBuildingLink(code.trim())
    setLoading(false)
    if (!res.ok) {
      setError(res.error ?? "Couldn't link to that building.")
      return
    }
    setLinkedBuilding(res.buildingName ?? "your building")
    goTo("unit")
  }

  async function saveUnitAndContinue() {
    setError(null)
    // Continue is disabled while empty; "I don't know it yet" is the skip.
    // Skippable, not optional-forever: the banner and the manager's
    // Incomplete filter both still chase it.
    if (!unit.trim()) return
    setLoading(true)
    const { error: e } = await setMyUnit(unit.trim())
    setLoading(false)
    if (e) {
      setError(e)
      return
    }
    goTo("linked")
  }

  /** Flip `onboarded`, keeping the screen usable if that fails. True on success. */
  async function completeOnboarding(): Promise<boolean> {
    setError(null)
    setLoading(true)
    try {
      await markOnboarded()
      return true
    } catch {
      setError("Couldn't finish setting up. Try again.")
      return false
    } finally {
      setLoading(false)
    }
  }

  async function finish() {
    // shell re-renders into the app once onboarded flips
    await completeOnboarding()
  }

  /**
   * Finish onboarding on the screen that resolves `target`.
   *
   * The shell's cold-load path already opens whatever route the URL names, and
   * it waits for onboarding to finish before reading it: the shell reads the
   * route exactly as it would a link, and writes the tab root beneath so Back
   * stays in the app.
   *
   * The URL is written only once `markOnboarded` has succeeded, so a failure
   * leaves the address bar as it was. That is still before the shell reads it:
   * markOnboarded's state update renders on a scheduler task, and this
   * continuation runs as a microtask ahead of it.
   *
   * Our own history keys are dropped so a stale entry cannot outrank the URL;
   * Next's are kept but `__NA`, as in the shell's `writeHistory`.
   */
  async function finishAt(target: Gap["target"]) {
    if (!(await completeOnboarding())) return
    const data = historyStateWithout(window.history.state, ["pet10x", "route", "activeTab", "depth"])
    // Replaces the whole query, a pending `target=` link included: tapping
    // "Do it now" is an explicit choice, and it wins.
    window.history.replaceState(data, "", "/app" + routeToSearch(target))
  }

  async function savePet() {
    setError(null)
    const name = petName.trim()
    if (!name || !species) return
    setLoading(true)
    const { error: e, pet } = await addPet({ name, species })
    if (e || !pet) {
      // The step stays, with everything typed, so trying again is one tap.
      setLoading(false)
      setError(userError(e, "Couldn't add your pet. Please try again.") ?? "Couldn't add your pet. Please try again.")
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
    setLoading(false)
    setAddedPet({ name, species, photo: photoFile ? photoPreview : null })
    goTo("done")
  }

  async function shareApp() {
    const url = typeof window !== "undefined" ? window.location.origin : "https://www.pet10x.com"
    const text = "Pet10x makes pet management easy for our building — registration, compliance, and a pet community. Worth setting up for our property."
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Pet10x", text, url })
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`)
        toast.success("Link copied", { description: "Share it with your building management." })
      }
    } catch {
      /* user dismissed the share sheet */
    }
  }

  /**
   * The way out, for someone who is not only a resident.
   *
   * Onboarding replaces the whole shell — including Profile, where the
   * switcher lives — so a manager who switched to the resident view would
   * otherwise be stranded here with no route back to their own building.
   * Absent for a plain signup, who has nowhere else to be.
   */
  const otherPersona = personas.find((p) => p !== "pet-owner")

  return (
    <div className="flex min-h-dvh flex-col bg-background px-6 pt-[env(safe-area-inset-top,56px)] pb-[env(safe-area-inset-bottom,32px)]">
      {otherPersona && (
        <button
          onClick={() => setActivePersona(otherPersona)}
          className="mb-2 flex items-center gap-1.5 self-start text-meta font-semibold text-muted-foreground transition-colors active:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {PERSONA_LABEL[otherPersona]}
        </button>
      )}

      {/* Intro */}
      {step === "intro" && (
        <div className="flex flex-1 flex-col">
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-primary">
            <PawPrint className="h-8 w-8 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <h1 className="mt-6 text-heading font-semibold leading-tight text-foreground">Welcome, {firstName} 👋</h1>
          {/* The strata question is gone. Most people arriving here were
              handed a code by their building and have no idea whether that
              counts as "managing pets, registration, rules or compliance" —
              the question asked them to classify their landlord. The code is
              the thing they physically have. */}
          <p className="mt-2 text-body leading-relaxed text-muted-foreground">
            If your property management uses Pet10x, they&apos;ve given you a building code. Enter it and
            we&apos;ll ask them to add you. Then you&apos;ll tell us about your pet.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={() => goTo("code")}
              className="flex items-center gap-3 rounded-2xl card-interactive p-4 text-left transition-transform active:scale-[0.98]"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-body font-semibold text-foreground">I have a Pet10x code</p>
                <p className="text-meta text-muted-foreground">From my building or property management</p>
              </div>
            </button>
            <button
              onClick={() => goTo("standalone")}
              className="flex items-center gap-3 rounded-2xl card-interactive p-4 text-left transition-transform active:scale-[0.98]"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft">
                <PawPrint className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-body font-semibold text-foreground">I don&apos;t have a code</p>
                <p className="text-meta text-muted-foreground">Just here for my pet — skip building setup</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Building code */}
      {step === "code" && (
        <div className="flex flex-1 flex-col">
          <button onClick={() => goTo("intro")} className="-ml-1 flex w-fit items-center gap-1 text-foreground" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-body">Back</span>
          </button>
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-info-soft">
            <Building2 className="h-8 w-8 text-info" />
          </div>
          <h1 className="mt-6 text-heading font-semibold text-foreground">Enter your building code</h1>
          <p className="mt-2 text-body leading-relaxed text-muted-foreground">
            Your property management shares this code. Entering it sends them a request to add you — your
            pets stay yours either way.
          </p>

          <div className="mt-6">
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase())
                  setError(null)
                }}
                placeholder="e.g. MCR2026"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={12}
                onKeyDown={(e) => e.key === "Enter" && linkBuilding()}
                className="w-full rounded-xl border border-input bg-card py-3 pl-11 pr-4 text-title font-mono font-semibold tracking-widest text-foreground placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {error && <ErrorText className="mt-1.5 text-meta">{error}</ErrorText>}
          </div>

          <Button onClick={linkBuilding} disabled={loading} className="mt-5 w-full">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Request to join
          </Button>
          <button onClick={() => goTo("standalone")} className="mt-3 text-center text-meta font-medium text-muted-foreground">
            I don&apos;t have a code
          </button>
        </div>
      )}

      {/* Unit */}
      {step === "unit" && (
        <div className="flex flex-1 flex-col">
          <button
            onClick={() => goTo("code")}
            className="-ml-1 flex w-fit items-center gap-1 text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-body">Back</span>
          </button>
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-primary-soft">
            <KeyRound className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-heading font-semibold text-foreground">Which unit are you in?</h1>
          <p className="mt-2 text-body leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">{linkedBuilding}</span> needs this to place you on
            their register.
          </p>

          <div className="mt-6">
            <input
              type="text"
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value)
                setError(null)
              }}
              placeholder="e.g. 2104"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && saveUnitAndContinue()}
              className="w-full rounded-xl border border-input bg-card px-4 py-3 text-title font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {error && <ErrorText className="mt-1.5 text-meta">{error}</ErrorText>}
          </div>

          <Button onClick={saveUnitAndContinue} disabled={loading || !unit.trim()} className="mt-5 w-full">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue
          </Button>
          <button
            onClick={() => goTo("linked")}
            className="mt-3 text-center text-meta font-medium text-muted-foreground"
          >
            I don&apos;t know it yet
          </button>
        </div>
      )}

      {/* Linked (pending) */}
      {step === "linked" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <h1 className="mt-6 text-heading font-semibold text-foreground">Request sent</h1>
          <p className="mt-2 max-w-sm text-body leading-relaxed text-muted-foreground">
            We&apos;ve asked <span className="font-semibold text-foreground">{linkedBuilding}</span>{" "}
            to add you. You&apos;ll be notified once approved. Next, tell us about your pet.
          </p>
          <Button size="lg" onClick={() => goTo("pet")} className="mt-8 w-full max-w-sm">
            Continue
          </Button>
        </div>
      )}

      {/* Standalone */}
      {step === "standalone" && (
        <div className="flex flex-1 flex-col">
          <button onClick={() => goTo("intro")} className="-ml-1 flex w-fit items-center gap-1 text-foreground" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-body">Back</span>
          </button>
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-primary-soft">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-heading font-semibold text-foreground">You&apos;re all set</h1>
          <p className="mt-2 text-body leading-relaxed text-muted-foreground">
            Track your pet&apos;s food, medicine and care, set reminders, and explore the community — no building needed. You
            can link a building anytime from your profile.
          </p>

          <div className="mt-7 rounded-2xl card-raised p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4.5 w-4.5 text-info" />
              <p className="text-body font-semibold text-foreground">Does your building manage pets?</p>
            </div>
            <p className="mt-1 text-meta leading-relaxed text-muted-foreground">
              Invite your property management to Pet10x — they can run registration, compliance and incident reporting for the
              whole building.
            </p>
            <Button variant="secondary" onClick={shareApp} className="mt-3">
              <Share2 className="h-4 w-4" /> Share with my management
            </Button>
          </div>

          <div className="mt-auto pt-8">
            <Button size="lg" onClick={() => goTo("pet")} className="w-full">
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Pet — the minimum to put a pet on the account. Breed, weight and the
          rest live on Add pet's "More details"; asking them here would turn the
          last step of signing up into a form. */}
      {shownStep === "pet" && (
        <div className="flex flex-1 flex-col">
          <h1 className="mt-6 text-heading font-semibold text-foreground">Tell us about your pet</h1>
          <p className="mt-2 text-body leading-relaxed text-muted-foreground">
            A name and what kind of pet. You can add the rest later.
          </p>

          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            className="mx-auto mt-6 flex h-24 w-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card transition-colors hover:bg-muted"
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

          <label
            htmlFor={petNameId}
            className="mb-2 mt-6 flex items-center gap-1.5 text-meta font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Name <RequiredTag />
          </label>
          <input
            id={petNameId}
            type="text"
            value={petName}
            onChange={(e) => {
              setPetName(e.target.value)
              setError(null)
            }}
            placeholder="e.g. Max"
            className="mb-5 w-full rounded-xl border border-input bg-card px-4 py-3 text-title text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />

          <p className="mb-2 flex items-center gap-1.5 text-meta font-semibold uppercase tracking-wide text-muted-foreground">
            Species <RequiredTag />
          </p>
          <SpeciesTiles
            value={species}
            onChange={(s) => {
              setSpecies(s)
              setError(null)
            }}
          />

          {error && (
            <ErrorText className="text-meta">
              {error}
            </ErrorText>
          )}

          <div className="mt-auto pt-8">
            <Button
              size="lg"
              onClick={savePet}
              disabled={loading || !petName.trim() || !species}
              className="w-full"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Add pet
            </Button>
            <button
              onClick={finish}
              disabled={loading}
              className="mt-3 w-full text-center text-meta font-medium text-muted-foreground"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {shownStep === "done" && donePet && (
        <PetAdded pet={donePet} busy={loading} error={error} onDoItNow={finishAt} onLater={finish} />
      )}
    </div>
  )
}

/** "Small mammal (rabbit, hamster…)" is a list label; the card wants the noun. */
function speciesLabel(species: Species): string {
  if (species === "dog") return "Dog"
  if (species === "cat") return "Cat"
  if (species === "other") return "Pet"
  return OTHER_SPECIES.find((o) => o.value === species)?.label.split(" (")[0] ?? "Pet"
}

/**
 * The pet that was just added, and exactly one thing to do next.
 *
 * Mounted only once the pet exists, so `useMyCompleteness` reads after the
 * insert and the first gap is about this pet (or the unit), not "Add your pet".
 * One step rather than the whole list: the list is Home's banner, and a new
 * owner offered six things tends to do none of them.
 */
function PetAdded({
  pet,
  busy,
  error,
  onDoItNow,
  onLater,
}: {
  pet: AddedPet
  busy: boolean
  /** Finishing failed; shown above the buttons so they can be tried again. */
  error: string | null
  onDoItNow: (target: Gap["target"]) => void
  onLater: () => void
}) {
  const { gaps, isLoading } = useMyCompleteness()
  const next = nextStepAfterPet(gaps)
  const Icon = pet.species === "dog" ? Dog : pet.species === "cat" ? Cat : PawPrint

  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-success-soft">
        <CheckCircle2 className="h-8 w-8 text-success" />
      </div>
      <h1 className="mt-6 text-heading font-semibold text-foreground">{pet.name} is on Pet10x</h1>

      <div className="mt-6 flex items-center gap-3 rounded-2xl card-raised p-4">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-soft">
          {pet.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pet.photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon className="h-6 w-6 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-title font-semibold text-foreground">{pet.name}</p>
          <p className="text-meta text-muted-foreground">{speciesLabel(pet.species)}</p>
        </div>
      </div>

      <div className="mt-auto pt-8">
        {error && (
          <ErrorText className="mb-3 text-meta">
            {error}
          </ErrorText>
        )}
        {isLoading ? (
          <>
            <div className="flex justify-center py-3.5" aria-label="Loading">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
            {/* Never trapped behind the spinner: a refetch that stalls or fails
                must not be the only thing between the owner and Home. */}
            <button
              onClick={onLater}
              disabled={busy}
              className="mt-3 w-full text-center text-meta font-medium text-muted-foreground"
            >
              Later
            </button>
          </>
        ) : next ? (
          <>
            <p className="text-meta font-semibold uppercase tracking-wide text-muted-foreground">Next step</p>
            <p className="mt-1 text-title font-semibold text-foreground">{next.label}</p>
            <Button size="lg" onClick={() => onDoItNow(next.target)} disabled={busy} className="mt-4 w-full">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Do it now
            </Button>
            <button
              onClick={onLater}
              disabled={busy}
              className="mt-3 w-full text-center text-meta font-medium text-muted-foreground"
            >
              Later
            </button>
          </>
        ) : (
          <Button size="lg" onClick={onLater} disabled={busy} className="w-full">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue to Pet10x
          </Button>
        )}
      </div>
    </div>
  )
}
