"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, KeyRound, Loader2, PawPrint } from "lucide-react"
import { AuthProvider, useAuth } from "@/lib/auth-context"
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
  const [view, setView] = useState<"choose" | "building" | "municipal">("choose")

  // Derived, not stored: exiting the report clears the guest session, and this
  // returns to the chooser without a second piece of state to keep in step.
  if (guestSession) return <GuestReportScreen />

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border/60 px-5 py-3.5 sm:px-8">
        <Link href="/" className="flex items-center gap-2" aria-label="Pet10x home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/30">
            <PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-foreground">Pet10x</span>
        </Link>
      </header>

      <main className="flex-1">
        {view === "choose" && (
          <ReportChooser onBuilding={() => setView("building")} onMunicipal={() => setView("municipal")} />
        )}
        {view === "building" && (
          <BuildingCodeStep onBack={() => setView("choose")} onMunicipal={() => setView("municipal")} />
        )}
        {view === "municipal" && <MunicipalReport onBack={() => setView("choose")} />}
      </main>

      <Toaster />
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
function BuildingCodeStep({ onBack, onMunicipal }: { onBack: () => void; onMunicipal: () => void }) {
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
            className="w-full rounded-xl border border-border bg-card py-3.5 pl-11 pr-4 font-mono text-[16px] font-semibold tracking-widest text-foreground placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
