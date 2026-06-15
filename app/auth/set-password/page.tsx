"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { PawPrint, Loader2 } from "lucide-react"

/**
 * Landing page for invite + password-recovery links. The browser client
 * establishes a session from the link (hash or ?code=); the user then sets a
 * password and is sent into the app.
 */
export default function SetPasswordPage() {
  const router = useRouter()
  const [status, setStatus] = useState<"verifying" | "ready" | "invalid">("verifying")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setStatus("invalid")
      return
    }
    let unsub: (() => void) | undefined
    const timer = setTimeout(() => setStatus((s) => (s === "verifying" ? "invalid" : s)), 5000)
    ;(async () => {
      const code = new URL(window.location.href).searchParams.get("code")
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code)
        } catch {
          /* fall through to session check */
        }
      }
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        setStatus("ready")
        return
      }
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_e, s) => {
        if (s) setStatus("ready")
      })
      unsub = () => subscription.unsubscribe()
    })()
    return () => {
      clearTimeout(timer)
      unsub?.()
    }
  }, [])

  const submit = async () => {
    setError(null)
    if (password.length < 8) return setError("Password must be at least 8 characters.")
    if (password !== confirm) return setError("Passwords don't match.")
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setSaving(true)
    const { error: updErr } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updErr) return setError("Couldn't set your password. The link may have expired — request a new one.")
    router.replace("/app")
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-secondary/40 px-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">Pet10x</span>
        </div>

        {status === "verifying" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-[14px] text-muted-foreground">Verifying your link…</p>
          </div>
        )}

        {status === "invalid" && (
          <div className="py-4 text-center">
            <h1 className="text-[18px] font-semibold">Link expired or invalid</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              This link is no longer valid. Request a new invite or password reset.
            </p>
            <button
              onClick={() => router.replace("/app")}
              className="mt-5 w-full rounded-lg border border-border py-2.5 text-[14px] font-semibold"
            >
              Back to sign in
            </button>
          </div>
        )}

        {status === "ready" && (
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">Set your password</h1>
            <p className="mt-1 text-[14px] text-muted-foreground">Choose a password to finish setting up your account.</p>
            <div className="mt-5 flex flex-col gap-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {error && <p className="text-[13px] text-destructive">{error}</p>}
              <button
                onClick={submit}
                disabled={saving}
                className="mt-1 w-full rounded-lg bg-primary py-2.5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Set password & continue"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
