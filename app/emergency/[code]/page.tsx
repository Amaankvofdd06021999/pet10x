"use client"

import { use, useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Dog,
  Cat,
  PawPrint,
  Phone,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Ban,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  fetchEmergencyDirectory,
  isCaution,
  type EmergencyDirectory,
  type EmergencyPet,
} from "@/lib/data/emergency"

/** How often to re-check the token, so a revoked link dies while it's open. */
const RECHECK_MS = 60_000

export default function EmergencyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)

  const [state, setState] = useState<"loading" | "ok" | "denied">("loading")
  const [data, setData] = useState<EmergencyDirectory | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [openFloor, setOpenFloor] = useState<number | null>(null)

  const load = useCallback(async () => {
    const res = await fetchEmergencyDirectory(code)
    if (!res.valid) {
      setData(null)
      setState("denied")
      return
    }
    setData(res)
    setRemaining(Math.max(0, Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000)))
    setState("ok")
  }, [code])

  useEffect(() => {
    void load()
  }, [load])

  // The countdown is derived from the token's real expires_at, not a fixed
  // client-side 4-hour timer. Re-validating on an interval means a manager who
  // revokes the token cuts off a session that's already open.
  useEffect(() => {
    if (state !== "ok") return
    const tick = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          setState("denied")
          setData(null)
          return 0
        }
        return s - 1
      })
    }, 1000)
    const recheck = setInterval(() => void load(), RECHECK_MS)
    return () => {
      clearInterval(tick)
      clearInterval(recheck)
    }
  }, [state, load])

  if (state === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (state === "denied" || !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
            <Ban className="h-6 w-6 text-destructive" />
          </span>
          <h1 className="mt-4 text-[20px] font-bold text-foreground">Access ended</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            This emergency link has expired or been revoked. Scan the placard again, or contact building management for
            a new one.
          </p>
        </div>
      </div>
    )
  }

  const hh = Math.floor(remaining / 3600)
  const mm = Math.floor((remaining % 3600) / 60)
  const ss = remaining % 60
  const clock = `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
  const urgent = remaining < 15 * 60

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 px-4 pt-safe backdrop-blur-xl">
        <div className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-destructive" />
              <h1 className="truncate text-[17px] font-bold text-foreground">Emergency pet info</h1>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{data.building.name}</p>
          </div>
          <div
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ${
              urgent ? "bg-destructive/15" : "bg-muted"
            }`}
          >
            <Clock className={`h-3 w-3 ${urgent ? "text-destructive" : "text-muted-foreground"}`} />
            <span
              className={`font-mono text-[12px] font-bold tabular-nums ${
                urgent ? "text-destructive" : "text-foreground"
              }`}
            >
              {clock}
            </span>
          </div>
        </div>
      </header>

      <main className="px-4 pb-10">
        <section className="mt-4 mb-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[14px] font-semibold text-foreground">{data.building.name}</p>
            {data.building.address && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">{data.building.address}</p>
            )}
          </div>
        </section>

        <section className="mb-4">
          <div className="grid grid-cols-3 gap-2">
            <Tally value={data.totals.total} label="Total pets" />
            <Tally value={data.totals.dogs} label="Dogs" icon={<Dog className="h-4 w-4 text-primary" />} />
            <Tally value={data.totals.cats} label="Cats" icon={<Cat className="h-4 w-4 text-info" />} />
          </div>
        </section>

        <section className="mb-4">
          <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
            <p className="text-[11px] leading-relaxed text-foreground">
              Supplementary information only. Not a life-safety system. Pet presence is based on last known status and
              may not reflect reality. Always follow standard fire and rescue protocols.
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-[15px] font-semibold text-foreground">Floor-by-floor pet presence</h2>

          {data.floors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <PawPrint className="h-6 w-6 text-muted-foreground" />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-foreground">No pets registered</h3>
              <p className="mx-auto mt-1 max-w-[22rem] text-[12px] leading-relaxed text-muted-foreground">
                No pets are on record for this building yet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.floors.map((floor) => {
                const pets = floor.units.flatMap((u) => u.pets)
                const isOpen = openFloor === floor.floor
                const hasCaution = pets.some((p) => isCaution(p.notes))

                return (
                  <div key={floor.floor} className="overflow-hidden rounded-xl border border-border bg-card">
                    <button
                      onClick={() => setOpenFloor(isOpen ? null : floor.floor)}
                      className="flex w-full items-center gap-3 p-3 text-left active:bg-muted"
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-[13px] font-bold text-foreground">
                        {floor.floor}
                      </span>
                      <span className="flex-1">
                        <span className="block text-[14px] font-semibold text-foreground">Floor {floor.floor}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {pets.length} pet{pets.length !== 1 ? "s" : ""} &middot; {floor.units.length} unit
                          {floor.units.length !== 1 ? "s" : ""}
                        </span>
                      </span>
                      {hasCaution && (
                        <Badge className="border-0 bg-destructive/15 text-[9px] text-destructive">CAUTION</Badge>
                      )}
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="border-t border-border px-3 pb-3 pt-2">
                        {floor.units.map((unit) => (
                          <div key={unit.unit} className="mb-2 last:mb-0">
                            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">UNIT {unit.unit}</p>
                            {unit.pets.map((pet) => (
                              <PetRow key={`${unit.unit}-${pet.name}`} pet={pet} />
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <p className="mt-6 text-center text-[10px] text-muted-foreground">
          Pet10x Emergency Access &middot; Park10x Services Inc.
        </p>
      </main>
    </div>
  )
}

function Tally({ value, label, icon }: { value: number; label: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="flex items-center justify-center gap-1">
        {icon}
        <p className="text-[22px] font-bold tabular-nums text-foreground">{value}</p>
      </div>
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

function PetRow({ pet }: { pet: EmergencyPet }) {
  const caution = isCaution(pet.notes)
  const Icon = pet.species === "dog" ? Dog : pet.species === "cat" ? Cat : PawPrint

  return (
    <div
      className={`mb-1.5 rounded-lg p-2.5 ${
        caution ? "border border-destructive/30 bg-destructive/10" : "bg-muted"
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Icon className={`h-4 w-4 ${pet.species === "dog" ? "text-primary" : "text-info"}`} />
        <span className="text-[13px] font-semibold text-foreground">{pet.name}</span>
        {caution && <Badge className="border-0 bg-destructive text-[9px] text-white">CAUTION</Badge>}
        {/* Presence, per the pet's own status — an away pet may not be in the unit. */}
        {!pet.present && (
          <Badge className="border-0 bg-background text-[9px] text-muted-foreground">
            {pet.status === "at_vet" ? "AT VET" : pet.status === "vacation" ? "AWAY" : "NOT HOME"}
          </Badge>
        )}
      </div>

      {pet.notes && (
        <p className={`text-[11px] leading-relaxed ${caution ? "text-foreground" : "text-muted-foreground"}`}>
          {pet.notes}
        </p>
      )}

      {pet.emergency && (
        <a
          href={`tel:${pet.emergency}`}
          className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-info"
        >
          <Phone className="h-3 w-3" />
          {pet.emergency}
        </a>
      )}
    </div>
  )
}
