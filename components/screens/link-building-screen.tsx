"use client"

import { ErrorText } from "@/components/ui/error-text"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { useMyBuildingLink, requestBuildingLink, leaveBuilding } from "@/lib/data"
import { toast } from "sonner"
import { ArrowLeft, Building2, KeyRound, Loader2, CheckCircle2, Clock, LogOut } from "lucide-react"

interface LinkBuildingScreenProps {
  onBack: () => void
}

export function LinkBuildingScreen({ onBack }: LinkBuildingScreenProps) {
  // requestBuildingLink and leaveBuilding refresh the shared link themselves,
  // so this screen (and Home) re-render from the store when they return.
  const { data: link, isLoading } = useMyBuildingLink()
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit() {
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
    toast.success("Request sent", { description: `${res.buildingName ?? "Your building"} will review it.` })
    setCode("")
  }

  async function leave() {
    setLoading(true)
    const { error: e } = await leaveBuilding()
    setLoading(false)
    if (e) return toast.error("Couldn't leave", { description: e })
    toast("You've left the building")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card px-4 pt-safe">
        <div className="flex h-12 items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1 text-foreground" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-title">Back</span>
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-title font-semibold text-foreground">Building</h1>
        </div>
      </header>

      <main className="ios-scroll flex-1 px-5 pb-24 pt-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : link ? (
          <div className="flex flex-col items-center text-center">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
                link.status === "approved" ? "bg-success-soft" : "bg-warning-soft"
              }`}
            >
              {link.status === "approved" ? (
                <CheckCircle2 className="h-8 w-8 text-success" />
              ) : (
                <Clock className="h-8 w-8 text-foreground" />
              )}
            </div>
            <h2 className="mt-5 text-heading font-semibold text-foreground">{link.buildingName}</h2>
            <p className="mt-1.5 text-body text-muted-foreground">
              {link.status === "approved"
                ? `You're a member${link.unit ? ` · Unit ${link.unit}` : ""}.`
                : "Membership pending — your building manager will review your request."}
            </p>
            <Button
              variant="secondary"
              onClick={leave}
              disabled={loading}
              className="mt-8 w-full"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4 text-destructive" />}
              {link.status === "approved" ? "Leave building" : "Cancel request"}
            </Button>
            <p className="mt-3 text-caption text-muted-foreground">Your pets and data stay with you either way.</p>
          </div>
        ) : (
          <div>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-info-soft">
              <Building2 className="h-8 w-8 text-info" />
            </div>
            <h2 className="mt-5 text-center text-heading font-semibold text-foreground">Link your building</h2>
            <p className="mt-1.5 text-center text-body leading-relaxed text-muted-foreground">
              Enter the code from your property management to join. They&apos;ll approve your request — your pets stay yours.
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
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="w-full rounded-xl border border-input bg-card py-3 pl-11 pr-4 text-title font-mono font-semibold tracking-widest text-foreground placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {error && <ErrorText className="mt-1.5 text-meta">{error}</ErrorText>}
            </div>

            <Button onClick={submit} disabled={loading} className="mt-5 w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Request to join
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
