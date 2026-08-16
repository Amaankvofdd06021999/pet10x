"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Crosshair,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  ShieldAlert,
} from "lucide-react"
import {
  MUNICIPAL_TYPES,
  resolveMunicipality,
  submitMunicipalReport,
  type MunicipalType,
  type Municipality,
} from "@/lib/data/municipal"

/**
 * Report an animal to a city.
 *
 * Three honesty constraints shape this screen:
 *
 *  1. Pet10x does not forward anything to a municipality. The confirmation
 *     says so and gives the real channel, because a person who has just
 *     watched a dog attack another needs somewhere to actually go.
 *  2. Emergencies are called out before the form, not after. If an animal or
 *     a person is being hurt right now, filling in a web form is the wrong
 *     action and the screen should say so first.
 *  3. Location is optional. An unrecognised postal code cannot be allowed to
 *     block a report — the record is still worth having.
 */
export function MunicipalReport({ onBack, signedIn }: { onBack: () => void; signedIn?: boolean }) {
  const [type, setType] = useState<MunicipalType | null>(null)
  const [description, setDescription] = useState("")
  const [postal, setPostal] = useState("")
  const [location, setLocation] = useState("")
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const [anonymous, setAnonymous] = useState(!signedIn)
  const [matched, setMatched] = useState<Municipality | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ reference: string; municipality: Municipality | null } | null>(null)

  /** Look up the city as soon as a full-looking postal code is typed. */
  async function checkPostal(value: string) {
    setPostal(value)
    const clean = value.replace(/\s/g, "")
    if (clean.length < 3) {
      setMatched(null)
      return
    }
    setMatched(await resolveMunicipality(clean))
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Location isn't available on this device.")
      return
    }
    setGeoBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoBusy(false)
        // Coordinates are recorded but cannot name a city without boundary
        // data, so the postal code is still what resolves the contact.
        toast.success("Location captured", { description: "Add a postal code too, so we can show who to contact." })
      },
      () => {
        setGeoBusy(false)
        toast.error("Couldn't get your location", { description: "Enter a postal code instead." })
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  async function submit() {
    if (!type) return toast.error("Pick what happened.")
    if (!description.trim()) return toast.error("Please describe what happened.")
    setSubmitting(true)
    const res = await submitMunicipalReport({
      type,
      description: description.trim(),
      postalCode: postal.trim() || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      location: location.trim() || null,
      anonymous,
    })
    setSubmitting(false)
    if (!res.ok) return toast.error("Couldn't file the report", { description: res.error })
    setDone({ reference: res.reference ?? "", municipality: res.municipality ?? null })
  }

  /* ── Confirmation ── */
  if (done) {
    const m = done.municipality
    return (
      <div className="mx-auto w-full max-w-xl px-5 py-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
          <Check className="h-7 w-7 text-success" />
        </div>
        <h1 className="mt-5 text-center text-[22px] font-semibold text-foreground">Report recorded</h1>
        <p className="mt-2 text-center text-[14px] text-muted-foreground">
          Your reference is <span className="font-mono font-semibold text-foreground">{done.reference}</span>
        </p>

        {/* The part that matters. Stated before the contact, not after it. */}
        <div className="mt-6 rounded-2xl border border-warning-strong/30 bg-[#FFF6E0] p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning-strong" />
            <p className="text-[13px] leading-relaxed text-foreground">
              <span className="font-semibold">Pet10x has not sent this to anyone.</span> We keep the record and
              your reference — filing officially is a separate step, below.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl card-raised p-5">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            File it with {m ? m.name : "your municipality"}
          </p>

          {m?.phone || m?.url ? (
            <div className="mt-3 flex flex-col gap-2">
              {m.phone && (
                <a
                  href={`tel:${m.phone.replace(/[^\d+]/g, "")}`}
                  className="flex items-center gap-2.5 rounded-xl bg-muted/60 px-3.5 py-3 text-[14px] font-semibold text-foreground"
                >
                  <Phone className="h-4 w-4 text-primary" /> {m.phone}
                </a>
              )}
              {m.url && (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-xl bg-muted/60 px-3.5 py-3 text-[14px] font-semibold text-foreground"
                >
                  <ExternalLink className="h-4 w-4 text-primary" /> Animal control online
                </a>
              )}
            </div>
          ) : (
            /* Contacts are admin-maintained and may not be filled in yet.
               Saying "we don't have it" beats showing a number nobody checked. */
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              {`We don't have animal-control contact details for ${m ? m.name : "this area"} yet.`} Search for
              your municipality&apos;s animal control or bylaw office, or call your city&apos;s main line.
            </p>
          )}

          <p className="mt-4 border-t border-border pt-3 text-[12.5px] leading-relaxed text-destructive">
            If an animal or a person is in immediate danger, call <span className="font-semibold">911</span>.
          </p>
        </div>

        <button
          onClick={onBack}
          className="mt-6 w-full rounded-xl card-interactive py-3 text-[15px] font-semibold text-foreground"
        >
          Done
        </button>
      </div>
    )
  }

  /* ── Form ── */
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-6">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-[14px] font-medium text-primary">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h1 className="text-[24px] font-semibold leading-tight text-foreground">Report to local municipality</h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
        For animals that hurt or endanger, anywhere — not just in a building. Noise, waste and damage inside a
        building go to the building manager instead.
      </p>

      {/* Before the form, not after it. */}
      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
        <p className="text-[13px] leading-relaxed text-foreground">
          <span className="font-semibold">Happening right now?</span> Call 911. Pet10x is not an emergency
          service and does not forward reports to authorities.
        </p>
      </div>

      <label className="mt-7 block text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        What happened
      </label>
      <div className="mt-2 flex flex-col gap-2">
        {MUNICIPAL_TYPES.map((t) => {
          const on = type === t.id
          return (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              aria-pressed={on}
              className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                on ? "border-primary bg-primary/5" : "border-border bg-card"
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                  on ? "border-primary bg-primary" : "border-border"
                }`}
              >
                {on && <Check className="h-3 w-3 text-primary-foreground" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold text-foreground">{t.label}</span>
                <span className="block text-[12.5px] text-muted-foreground">{t.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      <label htmlFor="mr-desc" className="mt-6 block text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        Describe it
      </label>
      <textarea
        id="mr-desc"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        placeholder="What did the animal look like? What happened, and when?"
        className="mt-2 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />

      <label htmlFor="mr-postal" className="mt-6 block text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        Where
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id="mr-postal"
          value={postal}
          onChange={(e) => checkPostal(e.target.value.toUpperCase())}
          placeholder="Postal code, e.g. V6B 1A1"
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-xl border border-input bg-card px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          onClick={useMyLocation}
          disabled={geoBusy}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-xl card-interactive px-3.5 py-3 text-[13.5px] font-semibold text-primary disabled:opacity-60"
        >
          {geoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          GPS
        </button>
      </div>

      {matched && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-success">
          <MapPin className="h-3.5 w-3.5" /> {matched.name}
          {matched.region ? `, ${matched.region}` : ""}
        </p>
      )}
      {coords && (
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          Location captured ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}).
        </p>
      )}

      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Street, park or intersection (optional)"
        className="mt-2 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />

      {signedIn && (
        <label className="mt-5 flex cursor-pointer items-center justify-between rounded-2xl card-raised p-4">
          <span>
            <span className="block text-[14.5px] font-medium text-foreground">Submit anonymously</span>
            <span className="block text-[12.5px] text-muted-foreground">Your name won&apos;t be attached</span>
          </span>
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="h-5 w-5 accent-[var(--primary)]"
          />
        </label>
      )}

      <button
        onClick={submit}
        disabled={submitting || !type || !description.trim()}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-strong py-3.5 text-[15px] font-semibold text-primary-strong-foreground disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Record report
      </button>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-muted-foreground">
        We&apos;ll give you a reference and show you who to file with. Pet10x does not submit on your behalf.
      </p>
    </div>
  )
}
