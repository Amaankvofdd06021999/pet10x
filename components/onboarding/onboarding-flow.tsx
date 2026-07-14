"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { requestBuildingLink } from "@/lib/data"
import { toast } from "sonner"
import { PawPrint, Building2, ArrowLeft, KeyRound, Loader2, CheckCircle2, Share2, Sparkles } from "lucide-react"

type Step = "intro" | "code" | "linked" | "standalone"

export function OnboardingFlow() {
  const { user, markOnboarded } = useAuth()
  const [step, setStep] = useState<Step>("intro")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [linkedBuilding, setLinkedBuilding] = useState("")
  const firstName = (user?.name || "there").split(" ")[0]

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
    setStep("linked")
  }

  async function finish() {
    setLoading(true)
    await markOnboarded()
    // shell re-renders into the app once onboarded flips
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

  return (
    <div className="flex min-h-dvh flex-col bg-background px-6 pt-[env(safe-area-inset-top,56px)] pb-[env(safe-area-inset-bottom,32px)]">
      {/* Intro */}
      {step === "intro" && (
        <div className="flex flex-1 flex-col">
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-primary shadow-lg shadow-primary/20">
            <PawPrint className="h-8 w-8 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <h1 className="mt-6 text-[26px] font-semibold leading-tight text-foreground">Welcome, {firstName} 👋</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Quick question to set things up. Does your building or strata manage pets — registration, rules, or compliance?
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={() => setStep("code")}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-transform active:scale-[0.98]"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-info/10">
                <Building2 className="h-5 w-5 text-info" />
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-foreground">Yes — my building manages pets</p>
                <p className="text-[13px] text-muted-foreground">I have a building code to join</p>
              </div>
            </button>
            <button
              onClick={() => setStep("standalone")}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-transform active:scale-[0.98]"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <PawPrint className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-foreground">No / not sure — I&apos;m here for my pet</p>
                <p className="text-[13px] text-muted-foreground">Track care, reminders &amp; community</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Building code */}
      {step === "code" && (
        <div className="flex flex-1 flex-col">
          <button onClick={() => setStep("intro")} className="-ml-1 flex w-fit items-center gap-1 text-primary" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[15px]">Back</span>
          </button>
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-info/10">
            <Building2 className="h-8 w-8 text-info" />
          </div>
          <h1 className="mt-6 text-[24px] font-semibold text-foreground">Enter your building code</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Your property management shares this code. We&apos;ll send them a request to add you — your pets stay yours either way.
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
                className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-[16px] font-mono font-semibold tracking-widest text-foreground placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {error && <p className="mt-1.5 text-[13px] text-destructive">{error}</p>}
          </div>

          <button
            onClick={linkBuilding}
            disabled={loading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Request to join
          </button>
          <button onClick={() => setStep("standalone")} className="mt-3 text-center text-[13px] font-medium text-muted-foreground">
            I don&apos;t have a code
          </button>
        </div>
      )}

      {/* Linked (pending) */}
      {step === "linked" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <h1 className="mt-6 text-[24px] font-semibold text-foreground">Request sent</h1>
          <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            We&apos;ve asked <span className="font-semibold text-foreground">{linkedBuilding}</span> to add you. You&apos;ll be
            notified once approved — meanwhile you can use everything in the app.
          </p>
          <button
            onClick={finish}
            disabled={loading}
            className="mt-8 flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue to Pet10x
          </button>
        </div>
      )}

      {/* Standalone */}
      {step === "standalone" && (
        <div className="flex flex-1 flex-col">
          <button onClick={() => setStep("intro")} className="-ml-1 flex w-fit items-center gap-1 text-primary" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[15px]">Back</span>
          </button>
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-primary/10">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-[24px] font-semibold text-foreground">You&apos;re all set</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Track your pet&apos;s food, medicine and care, set reminders, and explore the community — no building needed. You
            can link a building anytime from your profile.
          </p>

          <div className="mt-7 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4.5 w-4.5 text-info" />
              <p className="text-[14px] font-semibold text-foreground">Does your building manage pets?</p>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Invite your property management to Pet10x — they can run registration, compliance and incident reporting for the
              whole building.
            </p>
            <button
              onClick={shareApp}
              className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-[14px] font-semibold text-foreground transition-transform active:scale-[0.98]"
            >
              <Share2 className="h-4 w-4" /> Share with my management
            </button>
          </div>

          <div className="mt-auto pt-8">
            <button
              onClick={finish}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Continue to Pet10x
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
