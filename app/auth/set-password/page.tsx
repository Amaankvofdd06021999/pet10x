"use client"

import { useEffect, useState } from "react"
import { PasswordField } from "@/components/ui/password-field"
import { checkPassword } from "@/lib/auth/password-rules"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { ErrorText } from "@/components/ui/error-text"
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
    // Same ruleset the field's checklist shows, so the button cannot reject
    // something the panel just ticked green.
    const verdict = checkPassword(password)
    if (!verdict.ok) return setError(verdict.failed[0])
    if (password !== confirm) return setError("Passwords don't match.")
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setSaving(true)
    const { error: updErr } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updErr) {
      const m = updErr.message.toLowerCase()
      if (/different|same.*password|should be different/.test(m)) {
        return setError("Your new password must be different from your old one.")
      }
      if (/at least|weak|short|characters/.test(m)) {
        return setError("Please choose a stronger password.")
      }
      if (/expired|session|jwt|not authenticated|auth session missing/.test(m)) {
        // genuinely no usable session — fall back to the expired state
        setStatus("invalid")
        return
      }
      return setError("Couldn't set your password. Please try again.")
    }
    router.replace("/app")
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm rounded-2xl card-raised p-7">
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="text-title font-semibold tracking-tight">Pet10x</span>
        </div>

        {status === "verifying" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-meta text-muted-foreground">Verifying your link…</p>
          </div>
        )}

        {status === "invalid" && (
          <div className="py-4 text-center">
            <h1 className="text-title font-semibold">Link expired or invalid</h1>
            <p className="mt-2 text-meta text-muted-foreground">
              This link is no longer valid. Request a new invite or password reset.
            </p>
            <Button variant="secondary" onClick={() => router.replace("/app")} className="mt-5 w-full">
              Back to sign in
            </Button>
          </div>
        )}

        {status === "ready" && (
          <div>
            <h1 className="text-heading font-semibold tracking-tight">Set your password</h1>
            <p className="mt-1 text-meta text-muted-foreground">Choose a password to finish setting up your account.</p>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
              className="mt-5 flex flex-col gap-3"
            >
              {/* Also a creation flow (invite acceptance, password reset), so
                  it gets the same checklist and the same rules as signup. */}
              <PasswordField
                ariaLabel="New password"
                value={password}
                onChange={setPassword}
                placeholder="New password"
                autoComplete="new-password"
                showRules
              />
              <PasswordField
                ariaLabel="Confirm password"
                value={confirm}
                onChange={setConfirm}
                placeholder="Confirm password"
                autoComplete="new-password"
              />
              {error && <ErrorText className="text-meta">{error}</ErrorText>}
              <Button type="submit" disabled={saving} className="mt-1 w-full">
                {saving ? "Saving…" : "Set password & continue"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
