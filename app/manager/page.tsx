"use client"

import { useEffect, useState } from "react"
import { PasswordField } from "@/components/ui/password-field"
import Link from "next/link"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { ErrorText } from "@/components/ui/error-text"
import { InfoText } from "@/components/ui/info-text"
import { Building2, Loader2, Mail, Lock, ArrowLeft } from "lucide-react"

export default function ManagerPage() {
  return (
    <AuthProvider>
      <Gate />
      <Toaster position="top-center" />
    </AuthProvider>
  )
}

function Gate() {
  const { isAuthenticated, isLoading } = useAuth()
  useEffect(() => {
    // A hard navigation, not router.replace: this page's own "Pet owner?
    // Sign in here" link (below) prefetches /app while signed out, and the
    // client Router Cache then serves that stale unauthenticated redirect
    // back to /login forever after a real sign-in — only a full page load
    // re-hits the server/middleware with the now-valid session.
    if (isAuthenticated) window.location.href = "/app"
  }, [isAuthenticated])

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return <ManagerLogin />
}

function ManagerLogin() {
  const { signInWithPassword, resetPassword } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit() {
    setError(null)
    setInfo(null)
    if (!email || !password) return setError("Enter your email and password.")
    setLoading(true)
    const { error: e } = await signInWithPassword(email.trim(), password)
    setLoading(false)
    if (e) setError(e)
  }

  async function forgot() {
    setError(null)
    setInfo(null)
    if (!email.trim()) return setError("Enter your email first, then tap “Forgot password”.")
    const { error: e } = await resetPassword(email.trim())
    if (e) setError(e)
    else setInfo(`Password reset link sent to ${email.trim()}.`)
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6 py-10">
      <div className="w-full max-w-sm sm:max-w-md">
        <Link href="/app" className="mb-6 flex w-fit items-center gap-1 text-[14px] font-semibold text-foreground underline-offset-4 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Pet owner? Sign in here
        </Link>
        <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-info-soft sm:h-16 sm:w-16">
            <Building2 className="h-7 w-7 text-info sm:h-8 sm:w-8" />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold text-foreground sm:text-[26px]">Building Manager</h1>
          <p className="mt-1 text-[13px] text-muted-foreground sm:text-[14px]">Sign in to manage your building</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        {/* A real form: Enter submits from either field, and password managers
            recognise the pair. The labels are sr-only — the placeholders and
            icons already say it to sighted users. */}
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="flex flex-col gap-3"
        >
          <div className="relative">
            <label htmlFor="manager-email" className="sr-only">
              Email
            </label>
            <Mail className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              id="manager-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              autoCapitalize="none"
              className="w-full rounded-xl border border-input bg-card py-3 pl-11 pr-4 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
            />
          </div>
          <label htmlFor="manager-password" className="sr-only">
            Password
          </label>
          <PasswordField id="manager-password" value={password} onChange={setPassword} autoComplete="current-password" />
          {error && (
            <ErrorText className="text-meta">{error}</ErrorText>
          )}
          {info && (
            <InfoText>{info}</InfoText>
          )}
          <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
            Sign in
          </Button>
          <Button variant="quiet" size="sm" onClick={forgot} className="self-center">
            Forgot password?
          </Button>
        </form>
        </div>
        <p className="mt-6 text-center text-[12px] leading-relaxed text-muted-foreground">
          Managers are added by invitation. Ask your Pet10x admin if you don&apos;t have an account.
        </p>
        <Link
          href="/strata-portal"
          className="mx-auto mt-4 flex w-fit items-center gap-1.5 rounded-lg card-interactive px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:shadow-float"
        >
          <Building2 className="h-3.5 w-3.5 text-info" /> Manage multiple buildings? Open the Strata Portal
        </Link>
      </div>
    </div>
  )
}
