"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Building2, KeyRound, Loader2, PawPrint, Search } from "lucide-react"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { searchBuildingsPublic, type PublicBuilding } from "@/lib/data/incidents"
import { Toaster } from "@/components/ui/sonner"
import { ReportChooser } from "@/components/screens/report/report-chooser"
import { MunicipalReport } from "@/components/screens/report/municipal-report"
import { GuestReportScreen } from "@/components/screens/guest-report-screen"

/**
 * The public reporting entry point, linked from the landing nav.
 *
 * The whole flow lives here rather than bouncing through /login. The guest
 * session is React state in AuthProvider and is deliberately not persisted, so
 * sending someone to another route after they enter a code would drop it and
 * land them on a sign-in form they never asked for. Wrapping this page in its
 * own provider keeps code entry and the report on one route.
 *
 * No account is required for either path. Someone who watched a dog attack
 * another is usually not a resident and has nothing to sign in with.
 */
function ReportContent() {
  const { guestSession } = useAuth()
  const [view, setView] = useState<"choose" | "search" | "code" | "municipal">("choose")
  const [building, setBuilding] = useState<PublicBuilding | null>(null)

  // Derived, not stored: exiting the report clears the guest session, and this
  // returns to the chooser without a second piece of state to keep in step.
  if (guestSession) return <GuestReportScreen />

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-card px-5 py-3.5 sm:px-8">
        <Link href="/" className="flex items-center gap-2" aria-label="Pet10x home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/30">
            <PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-foreground">Pet10x</span>
        </Link>
      </header>

      <main className="flex-1">
        {view === "choose" && (
          <ReportChooser onBuilding={() => setView("search")} onMunicipal={() => setView("municipal")} />
        )}
        {view === "search" && (
          <BuildingSearchStep
            onBack={() => setView("choose")}
            onMunicipal={() => setView("municipal")}
            onPick={(b) => {
              setBuilding(b)
              setView("code")
            }}
          />
        )}
        {view === "code" && (
          <BuildingCodeStep
            building={building}
            onBack={() => setView("search")}
            onMunicipal={() => setView("municipal")}
          />
        )}
        {view === "municipal" && <MunicipalReport onBack={() => setView("choose")} />}
      </main>

      <Toaster />
    </div>
  )
}

/** One line of address, from the parts a building may or may not have filled in. */
function addressLine(b: PublicBuilding): string {
  return [b.address, b.city, b.region, b.postalCode].filter(Boolean).join(", ")
}

/**
 * Find the building, then ask for its code.
 *
 * This step exists because the flow used to open on a bare code field. A
 * witness standing outside a building knows the building — its name, or the
 * street it is on — and has no idea whether it uses Pet10x or what its code
 * is. Asking for the code first is asking for the one thing they are least
 * likely to have, with no signal they are even in the right place.
 *
 * Finding it here changes what the code field means: not "prove you belong",
 * but "here is the building you just confirmed, now the code from its lobby".
 * The search returns no id and no code, so this is orientation only — the code
 * is still what authorises the report.
 */
function BuildingSearchStep({
  onBack,
  onMunicipal,
  onPick,
}: {
  onBack: () => void
  onMunicipal: () => void
  onPick: (b: PublicBuilding) => void
}) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<PublicBuilding[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  // Debounced: typing an address fires a query per keystroke otherwise, and
  // the server caps results anyway so the extra round trips buy nothing.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 3) {
      setResults([])
      setSearched(false)
      return
    }
    let active = true
    setSearching(true)
    const t = setTimeout(() => {
      void searchBuildingsPublic(term).then((rows) => {
        if (!active) return
        setResults(rows)
        setSearching(false)
        setSearched(true)
      })
    }, 300)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [q])

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-8">
      <button onClick={onBack} className="mb-5 flex items-center gap-1.5 text-[14px] font-medium text-primary">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Building2 className="h-7 w-7 text-primary" />
      </div>
      <h1 className="mt-5 text-center text-[24px] font-semibold leading-tight text-foreground">
        Which building?
      </h1>
      <p className="mx-auto mt-2 max-w-md text-center text-[14.5px] leading-relaxed text-muted-foreground">
        Search by building name, street address or postal code. No account needed.
      </p>

      <div className="mt-7">
        <label
          htmlFor="building-search"
          className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Building name or address
        </label>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="building-search"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Maple Court, or 1450 Cambie"
            autoComplete="off"
            autoFocus
            className="w-full rounded-xl border border-input bg-card py-3.5 pl-11 pr-11 text-[16px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {searching && (
            <Loader2 className="absolute right-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {results.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {results.map((b, i) => (
            <li key={`${b.name}-${i}`}>
              <button
                onClick={() => onPick(b)}
                className="flex w-full items-center gap-3 rounded-xl card-interactive p-3.5 text-left transition-colors hover:shadow-float"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-foreground">{b.name}</span>
                  {addressLine(b) && (
                    <span className="block truncate text-[13px] text-muted-foreground">{addressLine(b)}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searched && !searching && results.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-card p-4 text-center">
          <p className="text-[14px] font-medium text-foreground">No building found</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            It may not be on Pet10x yet, or be listed under a different name. You can{" "}
            <button onClick={onMunicipal} className="font-semibold text-primary underline underline-offset-2">
              report to your local municipality
            </button>{" "}
            instead.
          </p>
        </div>
      )}

      {q.trim().length < 3 && (
        <p className="mt-5 text-center text-[12px] leading-relaxed text-muted-foreground">
          Already have the building code?{" "}
          <button
            onClick={() => onPick({ name: "", address: null, city: null, region: null, postalCode: null })}
            className="font-semibold text-primary underline underline-offset-2"
          >
            Enter it directly
          </button>
        </p>
      )}
    </div>
  )
}

/**
 * Building code entry.
 *
 * On success the guest session appears and the parent swaps to the report
 * screen — the same one the app has always used, which takes the code and
 * shows the building's pets as photos without ever exposing a unit number.
 */
function BuildingCodeStep({
  building,
  onBack,
  onMunicipal,
}: {
  building: PublicBuilding | null
  onBack: () => void
  onMunicipal: () => void
}) {
  const { signInGuest } = useAuth()
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!code.trim()) {
      setError("Enter your building code.")
      return
    }
    setError(null)
    setBusy(true)
    const err = await signInGuest(code)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-8">
      <button onClick={onBack} className="mb-5 flex items-center gap-1.5 text-[14px] font-medium text-primary">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h1 className="mt-5 text-center text-[24px] font-semibold leading-tight text-foreground">
        Enter the building code
      </h1>
      <p className="mx-auto mt-2 max-w-md text-center text-[14.5px] leading-relaxed text-muted-foreground">
        No account needed. Your property management shares this code — it&apos;s usually on a notice in the
        lobby or in your building&apos;s welcome pack.
      </p>

      {/* What was just picked. The search returns no code, so the reporter can
          be looking at the right building and still be stuck here — saying
          which one is the difference between "wrong code" and "wrong place". */}
      {building?.name && (
        <div className="mt-5 flex items-center gap-3 rounded-xl card-raised p-3.5">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-foreground">{building.name}</p>
            {addressLine(building) && (
              <p className="truncate text-[13px] text-muted-foreground">{addressLine(building)}</p>
            )}
          </div>
          <button onClick={onBack} className="flex-shrink-0 text-[13px] font-semibold text-primary">
            Change
          </button>
        </div>
      )}

      <div className="mt-7">
        <label htmlFor="report-code" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Building code
        </label>
        <div className="relative">
          <KeyRound className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="report-code"
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setError(null)
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. MCR2026"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={12}
            autoFocus
            className="w-full rounded-xl border border-input bg-card py-3.5 pl-11 pr-4 font-mono text-[16px] font-semibold tracking-widest text-foreground placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}
      </div>

      <button
        onClick={submit}
        disabled={busy}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Continue
      </button>

      <p className="mt-5 text-center text-[12px] leading-relaxed text-muted-foreground">
        Don&apos;t have the code? You can still{" "}
        {/* Goes to the municipal form, not back to the chooser — the sentence
            offers a destination, so the link should be one. */}
        <button onClick={onMunicipal} className="font-semibold text-primary underline underline-offset-2">
          report to your local municipality
        </button>
        .
      </p>
    </div>
  )
}

export default function ReportPage() {
  return (
    <AuthProvider>
      <ReportContent />
    </AuthProvider>
  )
}
