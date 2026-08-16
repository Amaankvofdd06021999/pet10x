"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, Check, Loader2 } from "lucide-react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { ReportChooser } from "@/components/screens/report/report-chooser"
import { MunicipalReport } from "@/components/screens/report/municipal-report"
import { myBuildingCode } from "@/lib/data/municipal"
import { submitIncident, reportablePets, INCIDENT_TYPE_LABEL, type ReportablePet, type IncidentType } from "@/lib/data/incidents"
import Image from "next/image"

/**
 * Reporting from inside the app, for a signed-in resident.
 *
 * Same two destinations as the public page, with one difference that matters:
 * a linked resident is not asked for their building code. They were given it
 * once, at join time, and have no reason to still have it — and we already
 * know which building they are in.
 */
export function ReportScreen({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<"choose" | "building" | "municipal">("choose")
  const [building, setBuilding] = useState<{ code: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void myBuildingCode().then((b) => {
      setBuilding(b)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <IOSNavBar title="Report" largeTitle={false} leftAction={<NavBackButton onClick={onBack} />} />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <IOSNavBar
        title="Report an incident"
        largeTitle={false}
        leftAction={<NavBackButton onClick={view === "choose" ? onBack : () => setView("choose")} />}
      />
      <main className="ios-scroll flex-1 pb-24">
        {view === "choose" && (
          <ReportChooser
            buildingName={building?.name ?? null}
            onBuilding={() => {
              if (!building) {
                toast.error("You're not linked to a building yet", {
                  description: "Join one with a building code, or report to your municipality instead.",
                })
                return
              }
              setView("building")
            }}
            onMunicipal={() => setView("municipal")}
          />
        )}
        {view === "building" && building && (
          <BuildingReport building={building} onDone={onBack} onBack={() => setView("choose")} />
        )}
        {view === "municipal" && <MunicipalReport signedIn onBack={() => setView("choose")} />}
      </main>
    </div>
  )
}

/**
 * The building path for someone already linked.
 *
 * Reuses the same photo-based pet picker as the guest flow and the same
 * submit path, so the privacy contract — a reporter never sees a unit number —
 * holds identically whether or not they have an account.
 */
function BuildingReport({
  building,
  onBack,
  onDone,
}: {
  building: { code: string; name: string }
  onBack: () => void
  onDone: () => void
}) {
  const TYPES: IncidentType[] = ["noise", "aggressive", "off_leash", "waste", "damage", "unregistered", "other"]
  const [type, setType] = useState<IncidentType | null>(null)
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [petId, setPetId] = useState<string | null>(null)
  const [pets, setPets] = useState<ReportablePet[]>([])
  const [anonymous, setAnonymous] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reference, setReference] = useState<string | null>(null)

  useEffect(() => {
    void reportablePets(building.code).then(setPets)
  }, [building.code])

  async function submit() {
    if (!type) return toast.error("Pick what happened.")
    if (!description.trim()) return toast.error("Please describe what happened.")
    setBusy(true)
    const res = await submitIncident({
      buildingCode: building.code,
      type,
      description: description.trim(),
      location: location.trim() || undefined,
      petId: petId ?? undefined,
      anonymous,
    })
    setBusy(false)
    if (!res.ok) return toast.error("Couldn't file the report", { description: res.error })
    setReference(res.reference ?? null)
  }

  if (reference) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
          <Check className="h-7 w-7 text-success" />
        </div>
        <h2 className="mt-5 text-[22px] font-semibold text-foreground">Sent to {building.name}</h2>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Reference <span className="font-mono font-semibold text-foreground">{reference}</span>. Your manager
          will see it on their alerts.
        </p>
        <button
          onClick={onDone}
          className="mt-7 w-full rounded-xl bg-primary-strong py-3 text-[15px] font-semibold text-primary-strong-foreground"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-6">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-[14px] font-medium text-primary">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="text-[22px] font-semibold leading-tight text-foreground">Report to {building.name}</h2>
      <p className="mt-1.5 text-[13.5px] text-muted-foreground">Goes to your building manager.</p>

      <label className="mt-6 block text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        What happened
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              type === t ? "bg-primary-strong text-primary-strong-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {INCIDENT_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        placeholder="Describe what happened…"
        className="mt-4 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Where in the building? (optional)"
        className="mt-2 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />

      {pets.length > 0 && (
        <>
          <label className="mt-6 block text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Which pet? (if you recognise them)
          </label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {pets.map((pet) => {
              const on = petId === pet.id
              return (
                <button
                  key={pet.id}
                  onClick={() => setPetId(on ? null : pet.id)}
                  aria-pressed={on}
                  className={`overflow-hidden rounded-xl border-2 text-left ${on ? "border-primary" : "border-transparent"}`}
                >
                  <span className="relative block aspect-square w-full bg-muted">
                    {pet.photoUrl ? (
                      <Image src={pet.photoUrl} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <AlertTriangle className="h-5 w-5 opacity-40" />
                      </span>
                    )}
                  </span>
                  <span className="block truncate px-1.5 py-1 text-[11.5px] font-semibold text-foreground">
                    {pet.name}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            Unit numbers aren&apos;t shown, to protect residents&apos; privacy.
          </p>
        </>
      )}

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

      <button
        onClick={submit}
        disabled={busy || !type || !description.trim()}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-strong py-3.5 text-[15px] font-semibold text-primary-strong-foreground disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Send to {building.name}
      </button>
    </div>
  )
}
