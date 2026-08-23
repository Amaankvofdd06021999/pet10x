"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import { DonateSpcaLink } from "@/components/donate-spca"
import { PICKER_ACCEPT, prepareChatImage } from "@/lib/ai/image"
import { reportablePetsSigned, uploadEvidence } from "@/lib/data/evidence"
import { submitIncident, type ReportablePet, type IncidentType as DbIncidentType } from "@/lib/data/incidents"
import {
  AlertTriangle,
  ArrowLeft,
  BadgeAlert,
  Check,
  CheckCircle2,
  CircleAlert,
  FileWarning,
  ImagePlus,
  Loader2,
  LocateFixed,
  MapPin,
  PawPrint,
  ShieldAlert,
  Trash2,
  Volume2,
  X,
} from "lucide-react"

/**
 * Pet10x — filing an incident report, once.
 *
 * There used to be two of these: `guest-report-screen.tsx` had a four-step
 * flow with an evidence step, and `report/report-screen.tsx` had a single flat
 * form for signed-in residents. One act, two implementations — so when the
 * evidence step was built it was built in one of them, and even there the
 * photo picker was a stub that pushed the string "/pets/dog1.jpg" and sent
 * nothing. The summary counted files that did not exist.
 *
 * This component is the one implementation. Both screens are shells around it:
 * they decide who the reporter is and which building they are filing against,
 * and nothing else about the report differs between them.
 */

type IncidentType = "noise" | "aggressive" | "off-leash" | "waste" | "damage" | "unregistered" | "other"

/**
 * type → evidence → pet → summary.
 *
 * Saying what happened and showing it are one act, so they share a step. The
 * pet choice gets its own rather than being buried at the bottom of the
 * longest one, and the summary exists so nobody submits without seeing what
 * they are about to send.
 */
type ReportStep = "type" | "evidence" | "pet" | "summary"

const ORDER: ReportStep[] = ["type", "evidence", "pet", "summary"]

/** The screen uses hyphenated ids; the DB enum uses underscores. */
const TYPE_TO_DB: Record<IncidentType, DbIncidentType> = {
  noise: "noise",
  aggressive: "aggressive",
  "off-leash": "off_leash",
  waste: "waste",
  damage: "damage",
  unregistered: "unregistered",
  other: "other",
}

const INCIDENT_TYPES: { id: IncidentType; label: string; icon: typeof AlertTriangle; color: string }[] = [
  { id: "noise", label: "Noise Complaint", icon: Volume2, color: "bg-warning/10 text-warning-strong" },
  { id: "aggressive", label: "Aggressive Behaviour", icon: ShieldAlert, color: "bg-destructive/10 text-destructive" },
  { id: "off-leash", label: "Off-Leash Violation", icon: PawPrint, color: "bg-primary/10 text-primary" },
  { id: "waste", label: "Waste / Cleanup", icon: Trash2, color: "bg-accent/10 text-accent" },
  { id: "damage", label: "Property Damage", icon: FileWarning, color: "bg-info/10 text-info" },
  // Carried over from the resident form, which offered it and the guest grid
  // did not. Collapsing the two flows must not quietly remove a type someone
  // could file yesterday.
  { id: "unregistered", label: "Unregistered Pet", icon: BadgeAlert, color: "bg-secondary text-secondary-foreground" },
  { id: "other", label: "Other Incident", icon: CircleAlert, color: "bg-muted text-muted-foreground" },
]

/** Both the sign route and the bucket stop at five; say so before the picker does. */
const MAX_FILES = 5
/**
 * Mirrors `app/api/incidents/evidence/sign/route.ts` and the `guest-evidence`
 * bucket's own file_size_limit. It is here to fail early with a sentence the
 * reporter can act on, not to be the enforcement point — storage is that.
 */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

/**
 * A uuid that does not need a secure context.
 *
 * `crypto.randomUUID` is secure-context gated; `crypto.getRandomValues` is
 * not. Same 122 bits either way, which is the only property this id is asked
 * to have.
 */
function newDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant 1
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

interface PendingPhoto {
  /** The bytes that will actually be uploaded — downscaled, JPEG. */
  file: File
  /** Object URL for the preview. Revoked on removal and on unmount. */
  url: string
}

export interface IncidentComposerProps {
  /** The building being filed against. The screen above decides how it was resolved. */
  building: { code: string; name: string }
  /** True for a guest with only a lobby code, false for a signed-in resident. */
  defaultAnonymous?: boolean
  /** Called when the reporter is finished — after submitting, or from the last screen. */
  onDone: () => void
  /** Called when they back out of the first step. */
  onBack: () => void
  /**
   * Optional control in the header, to the right of the title. The guest flow
   * puts its "Exit" (sign-out) button here; the resident flow already has app
   * chrome and passes nothing.
   */
  headerAction?: ReactNode
  /**
   * Show the SPCA donation prompt on the success screen. Off by default.
   *
   * Opt-in because it was reasoned about for guests specifically: someone who
   * scanned a lobby code, has no account and no other relationship with the
   * app. A signed-in resident filing about their own building is in a
   * different position, and asking them for money at the end of a civic duty
   * they performed inside a product they already use is a different ask.
   * Consolidating the two flows into this component moved the guest success
   * screen wholesale; this prop keeps the prompt where it was reasoned about
   * rather than spreading it by accident.
   */
  showDonatePrompt?: boolean
}

export function IncidentComposer({
  building,
  defaultAnonymous = true,
  onDone,
  onBack,
  headerAction,
  showDonatePrompt = false,
}: IncidentComposerProps) {
  const [step, setStep] = useState<ReportStep>("type")
  const [selectedType, setSelectedType] = useState<IncidentType | null>(null)
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  /* Pets, not units.
   *
   * The form used to ask a stranger to type "Unit involved", which hands out a
   * resident's home address in exchange for a code printed in the lobby — and
   * asks the reporter for something they usually do not know. What a witness
   * knows is what the animal looked like. */
  const [petId, setPetId] = useState<string | null>(null)
  const [pets, setPets] = useState<ReportablePet[]>([])
  const [petsLoading, setPetsLoading] = useState(true)
  const [petsError, setPetsError] = useState<string | null>(null)

  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [preparing, setPreparing] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  const [isAnonymous, setIsAnonymous] = useState(defaultAnonymous)
  const [submitting, setSubmitting] = useState(false)
  const [uploadFailed, setUploadFailed] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  /** What was actually sent, against what was attached. Set at submit time. */
  const [sent, setSent] = useState<{ photos: number; attached: number } | null>(null)

  /**
   * The report has no id until it is submitted, so evidence is uploaded under
   * a client-minted draft id and claimed by the RPC afterwards.
   * `crypto.randomUUID` is not decoration: the RPC's guard bounds evidence to
   * one building, and *within* a building it is the unguessability of this id
   * that stops one reporter attaching another's photos. Minted lazily, so it
   * is never generated during a server render, and held for the life of the
   * draft so every photo on one report shares a folder.
   *
   * `crypto.randomUUID` is secure-context only and is simply absent on an
   * http:// origin — a LAN-IP dev server, say — where it throws TypeError
   * rather than returning. `getRandomValues` carries no such restriction, and
   * it is the unguessability that is load-bearing here, not the API.
   */
  const draftIdRef = useRef<string | null>(null)
  const draftId = () => (draftIdRef.current ??= newDraftId())

  /* Pets are signed server-side: a guest holds no Supabase session, so
     `createSignedUrl` from the browser would return nothing for any of them. */
  useEffect(() => {
    let active = true
    setPetsLoading(true)
    void reportablePetsSigned(building.code).then((res) => {
      if (!active) return
      setPets(res.pets)
      setPetsError(res.error)
      setPetsLoading(false)
    })
    return () => {
      active = false
    }
  }, [building.code])

  /* Every object URL we mint is revoked — on removal, on reset, and here on
     unmount. This flow can be opened and abandoned repeatedly; leaked previews
     hold the full decoded photo in memory until the tab is closed. */
  const photosRef = useRef<PendingPhoto[]>([])
  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  useEffect(
    () => () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.url)
    },
    [],
  )

  // Fill the location field from the device GPS. The manual field stays the
  // source of truth — this just autofills the exact coordinates, which the
  // manager can open straight on a map (a precise pin, no third-party geocoder
  // and no API key involved). The reporter can still edit or clear it.
  const handleUseLocation = () => {
    setGeoError(null)
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoError("Location isn't available on this device — type it above.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setLocation(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — type it above instead."
            : "Couldn't get your location — type it above instead.",
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  /**
   * Picked photos are normalised now and uploaded later.
   *
   * Normalising at pick time rather than at send time means the thumbnail
   * renders even on a browser that cannot display HEIC, the reporter learns
   * immediately that a file is unusable, and what they see in the preview is
   * the bytes the manager will get. `prepareChatImage` decodes with the
   * platform's own decoders, fits the long edge to 1600px and re-encodes as
   * JPEG — which is also why the declared type below is always image/jpeg,
   * png or webp. The type we declare picks the extension the sign route mints
   * and is the one the bucket's allow-list judges, so it has to describe the
   * bytes we are actually sending, not the file the reporter chose.
   */
  const handleFiles = async (list: FileList | null) => {
    setPhotoError(null)
    // The recovery panel describes a send that is no longer the send being
    // made. Leaving it up implies a failure that is not live any more.
    setUploadFailed(null)
    const picked = Array.from(list ?? [])
    if (picked.length === 0) return

    const room = MAX_FILES - photos.length
    if (room <= 0) {
      setPhotoError(`You can add up to ${MAX_FILES} photos.`)
      return
    }

    setPreparing(true)
    const added: PendingPhoto[] = []
    const problems: string[] = []
    for (const original of picked.slice(0, room)) {
      const { file, error } = await prepareChatImage(original)
      if (error) {
        problems.push(error)
        continue
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        problems.push(`${original.name} is over 15 MB even after shrinking — try a different photo.`)
        continue
      }
      added.push({ file, url: URL.createObjectURL(file) })
    }
    setPreparing(false)

    if (added.length > 0) setPhotos((prev) => [...prev, ...added])
    if (picked.length > room) problems.push(`Only the first ${room} added — up to ${MAX_FILES} photos.`)
    if (problems.length > 0) setPhotoError(problems.join(" "))
    // Let the same file be picked again after it was removed.
    if (photoInput.current) photoInput.current.value = ""
  }

  const removePhoto = (idx: number) => {
    const doomed = photos[idx]
    if (doomed) URL.revokeObjectURL(doomed.url)
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
    setPhotoError(null)
    setUploadFailed(null)
  }

  /**
   * Upload first, then file the report with the paths that landed.
   *
   * `withoutPhotos` is the escape hatch, and it is the important one: if the
   * upload fails, the written account of what happened must still be able to
   * reach the manager. Someone who has just typed out an incident does not
   * lose it because their camera roll would not cooperate.
   */
  const handleSubmit = async (withoutPhotos = false) => {
    if (!selectedType || !description.trim() || submitting) return
    setSubmitting(true)
    setUploadFailed(null)

    // Everything below is inside try/catch/finally, and that is the whole
    // point. `submitting` disables the only button that can send this report,
    // so anything that escapes this function leaves the reporter's typed
    // account behind a permanently dead button — recoverable only by reloading
    // the page, which discards it. `finally` is what guarantees the button
    // comes back; `catch` is what makes the escape hatch below appear instead
    // of nothing at all.
    try {
      let paths: string[] = []
      if (photos.length > 0 && !withoutPhotos) {
        const up = await uploadEvidence(building.code, draftId(), photos.map((p) => p.file))
        if (up.error) {
          setUploadFailed(up.error)
          return
        }
        paths = up.paths
      }

      const res = await submitIncident({
        buildingCode: building.code,
        type: TYPE_TO_DB[selectedType],
        description: description.trim(),
        location: location.trim() || undefined,
        petId: petId ?? undefined,
        evidencePaths: paths.length > 0 ? paths : undefined,
        anonymous: isAnonymous,
      })
      // The recovery panel, not a toast. `bad_evidence_path` tells the reporter
      // "try sending without them" — and until this line, `uploadFailed` was set
      // only by an *upload* failure, so the "Send without photos" button they
      // were being pointed at never appeared. They were named an action they had
      // no control for, and retrying reproduced the same rejection forever; the
      // only way out was walking back to step 2 and deleting the photos one by
      // one. The same line fixes the quieter case: a send that fails after the
      // reporter already chose "send without photos" used to clear the panel and
      // leave a toast that faded.
      if (!res.ok) {
        setUploadFailed(res.error ?? "Couldn't file the report.")
        return
      }
      // Recorded before the success screen renders, because the success screen
      // has to be able to say "2 of 3 photos sent". `uploadEvidence` treats a
      // partial send as a success — correctly, the report should still go —
      // which makes disclosing it this caller's job. Saying nothing would let
      // the reporter walk away believing the manager has photos they do not.
      setSent({ photos: paths.length, attached: photos.length })
      setReference(res.reference ?? null)
    } catch {
      setUploadFailed("Something went wrong sending your report.")
    } finally {
      setSubmitting(false)
    }
  }

  const startOver = () => {
    for (const p of photos) URL.revokeObjectURL(p.url)
    setPhotos([])
    draftIdRef.current = null
    setStep("type")
    setSelectedType(null)
    setDescription("")
    setLocation("")
    setGeoError(null)
    setPetId(null)
    setPhotoError(null)
    setUploadFailed(null)
    setIsAnonymous(defaultAnonymous)
    setSent(null)
    setReference(null)
  }

  const goBack = () => {
    const i = ORDER.indexOf(step)
    if (i <= 0) {
      onBack()
      return
    }
    setStep(ORDER[i - 1])
  }

  if (reference) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-10 w-10 text-success" />
        </div>
        <h1 className="text-[24px] font-bold text-foreground">Report Submitted</h1>
        <p className="mt-3 text-center text-[15px] leading-relaxed text-muted-foreground">
          Your incident report has been filed with{" "}
          <span className="font-semibold text-foreground">{building.name}</span> management. They will
          investigate and follow up as needed.
        </p>
        {/* What was sent, when it is not what was attached. `uploadEvidence`
            keeps the photos that succeeded and calls that a success, so
            without this line the reporter walks away believing the manager has
            three photos when two arrived — and the two that did not may be the
            ones that showed the incident. */}
        {sent && sent.photos < sent.attached && (
          <p className="mt-4 w-full max-w-sm rounded-xl border border-warning/30 bg-warning/5 p-3 text-center text-[13px] leading-relaxed text-foreground">
            {sent.photos === 0
              ? `Sent without your ${sent.attached === 1 ? "photo" : `${sent.attached} photos`} — the description went through on its own.`
              : `${sent.photos} of ${sent.attached} photos sent. The ${
                  sent.attached - sent.photos === 1 ? "other one didn't" : "others didn't"
                } upload — you can file a second report with ${
                  sent.attached - sent.photos === 1 ? "it" : "them"
                } if it matters.`}
          </p>
        )}

        <p className="mt-2 text-center text-[13px] text-muted-foreground">
          Reference #: <span className="font-mono font-semibold text-foreground">{reference}</span>
          <br />
          <span className="text-[12px]">Keep this — you can use it to check the status of your report.</span>
        </p>

        <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
          <button
            onClick={startOver}
            className="w-full rounded-xl bg-primary py-3.5 text-[17px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            File Another Report
          </button>
          <button
            onClick={onDone}
            className="w-full rounded-xl border border-border py-3.5 text-[17px] font-semibold text-foreground transition-transform active:scale-[0.98]"
          >
            Done
          </button>
        </div>

        {/* Offered here, not before submitting — a donation prompt attached to
            the act of reporting would read as a toll on doing the right thing.
            And offered to guests only, which is who that reasoning was about;
            see `showDonatePrompt`. */}
        {showDonatePrompt && (
          <div className="mt-8 text-center">
            <p className="mb-2 text-[13px] text-muted-foreground">Want to do more for animals?</p>
            <DonateSpcaLink />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Nav.

          `pt-safe` on the sticky element, padding on the child — the shape
          `IOSNavBar` and every other full-viewport header in the app uses. The
          guest screen renders at /report with nothing above it, and the layout
          sets `viewportFit: "cover"`, so without the inset the title and the
          Exit button fall under the Dynamic Island on the exact device this
          feature is for: someone scanning a code in a lobby. It resolves to
          zero everywhere there is no inset, which is why the child keeps the
          `py-3` that sets the bar's height. */}
      <div className="sticky top-0 z-40 border-b border-border bg-card/80 pt-safe backdrop-blur-xl">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={goBack}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-transform active:scale-95"
                aria-label="Go back"
              >
                <ArrowLeft className="h-4 w-4 text-foreground" />
              </button>
              <div>
                <h1 className="text-[17px] font-semibold text-foreground">Report Incident</h1>
                <p className="text-[12px] text-muted-foreground">{building.name}</p>
              </div>
            </div>
            {headerAction}
          </div>

          {/* Progress bar */}
          <div className="mt-3 flex gap-2">
            {ORDER.map((s, i) => (
              <div key={s} className="flex-1">
                <div
                  className={`h-1 rounded-full transition-all ${
                    ORDER.indexOf(step) >= i ? "bg-primary" : "bg-muted"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-8 pt-4">
        {/* Step 1: what happened */}
        {step === "type" && (
          <div>
            <h2 className="mb-1 text-[22px] font-bold text-foreground">What happened?</h2>
            <p className="mb-6 text-[15px] text-muted-foreground">Select the type of incident to report.</p>

            <div className="grid grid-cols-2 gap-3">
              {INCIDENT_TYPES.map((type) => {
                const Icon = type.icon
                const isSelected = selectedType === type.id
                return (
                  <button
                    key={type.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedType(type.id)}
                    /* Selection is a ring, not a border swap. A permanent 2px
                       outline on every unselected tile competes with the one
                       tile that is selected, and on the tinted ground the card
                       already reads as a card without it. */
                    className={`flex flex-col items-center gap-3 rounded-2xl p-4 transition-all active:scale-[0.97] ${
                      isSelected ? "bg-primary/5 ring-2 ring-primary" : "card-interactive"
                    }`}
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${type.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="text-center text-[13px] font-semibold text-foreground">{type.label}</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => selectedType && setStep("evidence")}
              disabled={!selectedType}
              className={`mt-6 w-full rounded-xl py-3.5 text-[17px] font-semibold transition-all active:scale-[0.98] ${
                selectedType ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: the account and the photos, together */}
        {step === "evidence" && (
          <div>
            <h2 className="mb-1 text-[22px] font-bold text-foreground">Evidence</h2>
            <p className="mb-6 text-[15px] text-muted-foreground">
              Describe what happened and add photos. Both reach the building manager together.
            </p>

            <div className="flex flex-col gap-5">
              {/* Description */}
              <div>
                <label htmlFor="desc" className="mb-2 block text-[13px] font-semibold uppercase text-muted-foreground">
                  Description <span className="text-destructive">*</span>
                </label>
                <textarea
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the incident in detail..."
                  rows={4}
                  className="w-full rounded-xl border border-input bg-card p-3 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Location */}
              <div>
                <label htmlFor="loc" className="mb-2 block text-[13px] font-semibold uppercase text-muted-foreground">
                  Location
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="loc"
                    type="text"
                    value={location}
                    onChange={(e) => {
                      setLocation(e.target.value)
                      setGeoError(null)
                    }}
                    placeholder="e.g. Lobby, Floor 12, Parking B2"
                    className="w-full rounded-xl border border-input bg-card py-3 pl-10 pr-4 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleUseLocation}
                  disabled={locating}
                  className="mt-2 flex items-center gap-2 rounded-xl card-interactive px-3 py-2 text-[13px] font-semibold text-primary transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                  {locating ? "Locating…" : "Use my current location"}
                </button>
                {geoError ? (
                  <p className="mt-1.5 text-[12px] text-destructive">{geoError}</p>
                ) : (
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    Autofill your GPS position, or type the spot above.
                  </p>
                )}
              </div>

              {/* Photos — real files, uploaded when the report is sent. */}
              <div>
                <p className="mb-3 text-[13px] font-semibold uppercase text-muted-foreground">Photos</p>
                <input
                  ref={photoInput}
                  type="file"
                  accept={PICKER_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => void handleFiles(e.target.files)}
                />
                <div className="flex flex-wrap gap-3">
                  {photos.map((photo, idx) => (
                    <div key={photo.url} className="relative h-24 w-24 overflow-hidden rounded-xl bg-muted">
                      {/* A blob: URL has nothing for the image optimiser to do. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={`Evidence ${idx + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/80"
                        aria-label={`Remove photo ${idx + 1}`}
                      >
                        <X className="h-3 w-3 text-background" />
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_FILES && (
                    <button
                      type="button"
                      onClick={() => photoInput.current?.click()}
                      disabled={preparing}
                      aria-busy={preparing}
                      className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-card transition-all active:scale-95 disabled:opacity-60"
                    >
                      {preparing ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      ) : (
                        <ImagePlus className="h-6 w-6 text-muted-foreground" />
                      )}
                      <span className="text-[11px] text-muted-foreground">{preparing ? "Preparing…" : "Add"}</span>
                    </button>
                  )}
                </div>
                {/* Announced, not just shown: a rejected photo is the one
                    thing here a reporter can miss and act on wrongly. */}
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-2 text-[12px] ${photoError ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {photoError ??
                    `Up to ${MAX_FILES} photos. They're shrunk on your phone and sent when you submit.`}
                </p>
              </div>
            </div>

            <button
              onClick={() => description.trim() && setStep("pet")}
              disabled={!description.trim()}
              className={`mt-6 w-full rounded-xl py-3.5 text-[17px] font-semibold transition-all active:scale-[0.98] ${
                description.trim() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 3: which pet — by sight, never by unit. */}
        {step === "pet" && (
          <div>
            <h2 className="mb-1 text-[22px] font-bold text-foreground">Which pet?</h2>
            <p className="mb-6 text-[15px] text-muted-foreground">
              Pick them out if you recognise them. You can skip this — the description you just wrote is
              enough for the manager to look into it.
            </p>

            {petsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : petsError ? (
              /* Not the same sentence as "there are none". The route answers
                 502 when it cannot sign the photos, and telling someone who
                 recognised the dog that no pets are registered is a false
                 statement about the building. The step is skippable either
                 way, so this informs rather than blocks. */
              <p
                role="status"
                className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-center text-[13px] leading-relaxed text-foreground"
              >
                {petsError} You can still send the report — your description is what the manager will go
                on.
              </p>
            ) : pets.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-[13px] text-muted-foreground">
                No registered pets to choose from — your description is what the manager will go on.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {pets.map((pet) => {
                  const on = petId === pet.id
                  return (
                    <button
                      key={pet.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPetId(on ? null : pet.id)}
                      className={`overflow-hidden rounded-xl border-2 text-left transition-colors ${
                        on ? "border-primary" : "border-transparent"
                      }`}
                    >
                      <span className="relative block aspect-square w-full bg-muted">
                        {pet.photoUrl ? (
                          <Image src={pet.photoUrl} alt="" fill className="object-cover" unoptimized />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center">
                            <PawPrint className="h-6 w-6 text-muted-foreground" />
                          </span>
                        )}
                        {on && (
                          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </span>
                        )}
                      </span>
                      <span className="block truncate px-1.5 py-1 text-[11.5px] font-semibold text-foreground">
                        {pet.name}
                      </span>
                      <span className="block truncate px-1.5 pb-1.5 text-[10.5px] text-muted-foreground">
                        {pet.breed || pet.species}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
              Unit numbers aren&apos;t shown — a code from the lobby shouldn&apos;t hand out where someone
              lives.
            </p>

            <button
              onClick={() => setStep("summary")}
              className="mt-6 w-full rounded-xl bg-primary py-3.5 text-[17px] font-semibold text-primary-foreground transition-all active:scale-[0.98]"
            >
              {petId ? "Continue" : "Skip — I don't recognise them"}
            </button>
          </div>
        )}

        {/* Step 4: summary — the reporter sees what they are sending. */}
        {step === "summary" && (
          <div>
            <h2 className="mb-1 text-[22px] font-bold text-foreground">Check and send</h2>
            <p className="mb-6 text-[15px] text-muted-foreground">
              This goes to {building.name}. Nothing is sent until you tap below.
            </p>

            <div className="mb-6 rounded-2xl card-raised p-4">
              <h3 className="mb-3 text-[15px] font-semibold text-foreground">Report Summary</h3>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="text-[13px] text-muted-foreground">Type</span>
                  <span className="text-[13px] font-medium text-foreground">
                    {INCIDENT_TYPES.find((t) => t.id === selectedType)?.label}
                  </span>
                </div>
                {/* The description is the report. Showing only its metadata and
                    hiding the words themselves is how a typo reaches a manager. */}
                <div className="border-y border-border py-2">
                  <span className="mb-1 block text-[13px] text-muted-foreground">What happened</span>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{description}</p>
                  <button
                    onClick={() => setStep("evidence")}
                    className="mt-1.5 text-[12px] font-semibold text-primary underline underline-offset-2"
                  >
                    Edit
                  </button>
                </div>
                <div className="flex justify-between">
                  <span className="text-[13px] text-muted-foreground">Location</span>
                  <span className="text-[13px] font-medium text-foreground">{location || "Not specified"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[13px] text-muted-foreground">Pet</span>
                  <span className="text-[13px] font-medium text-foreground">
                    {pets.find((x) => x.id === petId)?.name ?? "Not identified"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[13px] text-muted-foreground">Photos</span>
                  <span className="text-[13px] font-medium text-foreground">
                    {photos.length === 0 ? "None" : `${photos.length} photo${photos.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {photos.map((photo, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={photo.url}
                        src={photo.url}
                        alt={`Evidence ${idx + 1}`}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    ))}
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[13px] text-muted-foreground">Anonymous</span>
                  <span className="text-[13px] font-medium text-foreground">{isAnonymous ? "Yes" : "No"}</span>
                </div>
              </div>
            </div>

            {/* Anonymous toggle.
                A button, not a <label> wrapped round a clickable <div>. That
                shape looks identical and is operable by mouse only: the label
                has no control to activate, and a div with role="switch" takes
                no focus and answers no keypress. */}
            <button
              type="button"
              role="switch"
              aria-checked={isAnonymous}
              onClick={() => setIsAnonymous(!isAnonymous)}
              className="flex w-full items-center justify-between rounded-xl card-raised p-4 text-left"
            >
              <span>
                <span className="block text-[15px] font-medium text-foreground">Submit anonymously</span>
                <span className="block text-[13px] text-muted-foreground">
                  Your identity will be hidden from the report
                </span>
              </span>
              <span
                className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
                  isAnonymous ? "bg-success" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-card shadow-md transition-transform ${
                    isAnonymous ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>

            {/* A failed upload must never cost someone their written account. */}
            {uploadFailed && (
              <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-[13.5px] font-semibold text-destructive">{uploadFailed}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  {photos.length > 0
                    ? "Your report is still here. Try the photos again, or send what you wrote without them — the manager will still see it."
                    : "Your report is still here — nothing you typed was lost. Try again."}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => void handleSubmit()}
                    disabled={submitting}
                    className="flex-1 rounded-lg bg-primary py-2.5 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {photos.length > 0 ? "Try the photos again" : "Try again"}
                  </button>
                  {photos.length > 0 && (
                    <button
                      onClick={() => void handleSubmit(true)}
                      disabled={submitting}
                      className="flex-1 rounded-lg border border-border py-2.5 text-[13.5px] font-semibold text-foreground disabled:opacity-60"
                    >
                      Send without photos
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Replaced, not accompanied, by the recovery buttons above — two
                primary actions saying different things is how someone retries
                the upload while meaning to send without it. */}
            {!uploadFailed && (
              <button
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="mt-4 w-full rounded-xl bg-primary py-3.5 text-[17px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? (photos.length > 0 ? "Sending photos…" : "Filing report…") : "Submit Report"}
              </button>
            )}

            <p className="mt-3 text-center text-[12px] leading-relaxed text-muted-foreground">
              By submitting, you confirm this report is truthful and accurate. False reports may result in
              penalties under building bylaws.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
