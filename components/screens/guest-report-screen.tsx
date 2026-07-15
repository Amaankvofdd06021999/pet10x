"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { submitIncident, type IncidentType as DbIncidentType } from "@/lib/data/incidents"
import {
  ArrowLeft,
  Camera,
  MapPin,
  AlertTriangle,
  Volume2,
  PawPrint,
  Trash2,
  ShieldAlert,
  FileWarning,
  CircleAlert,
  CheckCircle2,
  ImagePlus,
  X,
  LogOut,
  LocateFixed,
  Loader2,
} from "lucide-react"

type IncidentType = "noise" | "aggressive" | "off-leash" | "waste" | "damage" | "other"
type ReportStep = "type" | "details" | "evidence" | "submitted"

/** The screen uses hyphenated ids; the DB enum uses underscores. */
const TYPE_TO_DB: Record<IncidentType, DbIncidentType> = {
  noise: "noise",
  aggressive: "aggressive",
  "off-leash": "off_leash",
  waste: "waste",
  damage: "damage",
  other: "other",
}

const INCIDENT_TYPES: { id: IncidentType; label: string; icon: typeof AlertTriangle; color: string }[] = [
  { id: "noise", label: "Noise Complaint", icon: Volume2, color: "bg-warning/10 text-[#FFCC00]" },
  { id: "aggressive", label: "Aggressive Behaviour", icon: ShieldAlert, color: "bg-destructive/10 text-destructive" },
  { id: "off-leash", label: "Off-Leash Violation", icon: PawPrint, color: "bg-primary/10 text-primary" },
  { id: "waste", label: "Waste / Cleanup", icon: Trash2, color: "bg-accent/10 text-accent" },
  { id: "damage", label: "Property Damage", icon: FileWarning, color: "bg-info/10 text-info" },
  { id: "other", label: "Other Incident", icon: CircleAlert, color: "bg-muted text-muted-foreground" },
]

export function GuestReportScreen() {
  const { guestSession, signOut } = useAuth()
  const [step, setStep] = useState<ReportStep>("type")
  const [selectedType, setSelectedType] = useState<IncidentType | null>(null)
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [unitNumber, setUnitNumber] = useState("")
  const [photos, setPhotos] = useState<string[]>([])
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reference, setReference] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

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

  const handlePhotoAdd = () => {
    // Simulate adding a photo
    setPhotos((prev) => [...prev, `/pets/dog1.jpg`])
  }

  const handleSubmit = async () => {
    if (!selectedType || !guestSession?.buildingCode) return
    setSubmitting(true)
    const res = await submitIncident({
      buildingCode: guestSession.buildingCode,
      type: TYPE_TO_DB[selectedType],
      description: description.trim(),
      location: location.trim() || undefined,
      unit: unitNumber.trim() || undefined,
      anonymous: isAnonymous,
    })
    setSubmitting(false)
    if (!res.ok) {
      toast.error("Couldn't file the report", { description: res.error })
      return
    }
    setReference(res.reference ?? null)
    setStep("submitted")
  }

  if (step === "submitted") {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="flex flex-1 flex-col items-center justify-center px-8">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <h1 className="text-[24px] font-bold text-foreground">Report Submitted</h1>
          <p className="mt-3 text-center text-[15px] leading-relaxed text-muted-foreground">
            Your incident report has been filed with{" "}
            <span className="font-semibold text-foreground">{guestSession?.buildingName}</span>{" "}
            management. They will investigate and follow up as needed.
          </p>
          <p className="mt-2 text-center text-[13px] text-muted-foreground">
            Reference #: <span className="font-mono font-semibold text-foreground">{reference}</span>
            <br />
            <span className="text-[12px]">Keep this — you can use it to check the status of your report.</span>
          </p>

          <div className="mt-8 flex w-full flex-col gap-3">
            <button
              onClick={() => {
                setStep("type")
                setSelectedType(null)
                setDescription("")
                setLocation("")
                setUnitNumber("")
                setPhotos([])
                setReference(null)
              }}
              className="w-full rounded-xl bg-primary py-3.5 text-[17px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              File Another Report
            </button>
            <button
              onClick={signOut}
              className="w-full rounded-xl border border-border py-3.5 text-[17px] font-semibold text-foreground transition-transform active:scale-[0.98]"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Nav */}
      <div className="sticky top-0 z-40 border-b border-border bg-card/80 px-4 pt-14 pb-3 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step !== "type" ? (
              <button
                onClick={() => setStep(step === "evidence" ? "details" : "type")}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-transform active:scale-95"
                aria-label="Go back"
              >
                <ArrowLeft className="h-4 w-4 text-foreground" />
              </button>
            ) : null}
            <div>
              <h1 className="text-[17px] font-semibold text-foreground">Report Incident</h1>
              <p className="text-[12px] text-muted-foreground">{guestSession?.buildingName}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-transform active:scale-95"
          >
            <LogOut className="h-3.5 w-3.5" />
            Exit
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex gap-2">
          {["type", "details", "evidence"].map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1 rounded-full transition-all ${
                (step === "type" && i === 0) || (step === "details" && i <= 1) || (step === "evidence" && i <= 2)
                  ? "bg-destructive"
                  : "bg-muted"
              }`} />
            </div>
          ))}
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-8 pt-4">
        {/* Step 1: Select Type */}
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
                    onClick={() => setSelectedType(type.id)}
                    className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-4 transition-all active:scale-[0.97] ${
                      isSelected
                        ? "border-destructive bg-destructive/5"
                        : "border-border bg-card"
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
              onClick={() => selectedType && setStep("details")}
              disabled={!selectedType}
              className={`mt-6 w-full rounded-xl py-3.5 text-[17px] font-semibold transition-all active:scale-[0.98] ${
                selectedType
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Details */}
        {step === "details" && (
          <div>
            <h2 className="mb-1 text-[22px] font-bold text-foreground">Provide Details</h2>
            <p className="mb-6 text-[15px] text-muted-foreground">
              Describe what happened. The more detail the better.
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
                  className="w-full rounded-xl border border-border bg-card p-3 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                    onChange={(e) => { setLocation(e.target.value); setGeoError(null) }}
                    placeholder="e.g. Lobby, Floor 12, Parking B2"
                    className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleUseLocation}
                  disabled={locating}
                  className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[13px] font-semibold text-primary transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                  {locating ? "Locating…" : "Use my current location"}
                </button>
                {geoError ? (
                  <p className="mt-1.5 text-[12px] text-destructive">{geoError}</p>
                ) : (
                  <p className="mt-1.5 text-[12px] text-muted-foreground">Autofill your GPS position, or type the spot above.</p>
                )}
              </div>

              {/* Unit */}
              <div>
                <label htmlFor="unit" className="mb-2 block text-[13px] font-semibold uppercase text-muted-foreground">
                  Unit involved (if known)
                </label>
                <input
                  id="unit"
                  type="text"
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  placeholder="e.g. 2104"
                  className="w-full rounded-xl border border-border bg-card py-3 px-4 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Anonymous toggle */}
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card p-4">
                <div>
                  <p className="text-[15px] font-medium text-foreground">Submit anonymously</p>
                  <p className="text-[13px] text-muted-foreground">Your identity will be hidden from the report</p>
                </div>
                <div
                  className={`relative h-7 w-12 rounded-full transition-colors ${
                    isAnonymous ? "bg-success" : "bg-muted"
                  }`}
                  onClick={() => setIsAnonymous(!isAnonymous)}
                  role="switch"
                  aria-checked={isAnonymous}
                >
                  <div
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-card shadow-md transition-transform ${
                      isAnonymous ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </div>
              </label>
            </div>

            <button
              onClick={() => description.trim() && setStep("evidence")}
              disabled={!description.trim()}
              className={`mt-6 w-full rounded-xl py-3.5 text-[17px] font-semibold transition-all active:scale-[0.98] ${
                description.trim()
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              Continue to Evidence
            </button>
          </div>
        )}

        {/* Step 3: Evidence & Submit */}
        {step === "evidence" && (
          <div>
            <h2 className="mb-1 text-[22px] font-bold text-foreground">Add Evidence</h2>
            <p className="mb-6 text-[15px] text-muted-foreground">
              Upload photos or video as proof. This helps building management investigate.
            </p>

            {/* Photo Upload */}
            <div className="mb-6">
              <p className="mb-3 text-[13px] font-semibold uppercase text-muted-foreground">
                Photos / Video
              </p>
              <div className="flex flex-wrap gap-3">
                {photos.map((photo, idx) => (
                  <div key={idx} className="relative h-24 w-24 overflow-hidden rounded-xl bg-muted">
                    <div className="h-full w-full bg-muted flex items-center justify-center">
                      <Camera className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                    <button
                      onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/80"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3 text-background" />
                    </button>
                    <span className="absolute bottom-1 left-1 rounded bg-foreground/60 px-1.5 py-0.5 text-[9px] text-background">
                      Photo {idx + 1}
                    </span>
                  </div>
                ))}
                <button
                  onClick={handlePhotoAdd}
                  className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-card transition-all active:scale-95"
                >
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">Add</span>
                </button>
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Add photos or videos as evidence. Max 5 files.
              </p>
            </div>

            {/* Summary */}
            <div className="mb-6 rounded-2xl border border-border bg-card p-4">
              <h3 className="mb-3 text-[15px] font-semibold text-foreground">Report Summary</h3>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="text-[13px] text-muted-foreground">Type</span>
                  <span className="text-[13px] font-medium text-foreground">
                    {INCIDENT_TYPES.find((t) => t.id === selectedType)?.label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[13px] text-muted-foreground">Location</span>
                  <span className="text-[13px] font-medium text-foreground">{location || "Not specified"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[13px] text-muted-foreground">Unit</span>
                  <span className="text-[13px] font-medium text-foreground">{unitNumber || "Unknown"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[13px] text-muted-foreground">Evidence</span>
                  <span className="text-[13px] font-medium text-foreground">{photos.length} file(s)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[13px] text-muted-foreground">Anonymous</span>
                  <span className="text-[13px] font-medium text-foreground">{isAnonymous ? "Yes" : "No"}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-xl bg-destructive py-3.5 text-[17px] font-semibold text-destructive-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? "Filing report…" : "Submit Report"}
            </button>

            <p className="mt-3 text-center text-[12px] leading-relaxed text-muted-foreground">
              By submitting, you confirm this report is truthful and accurate. False reports may result in penalties under building bylaws.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
