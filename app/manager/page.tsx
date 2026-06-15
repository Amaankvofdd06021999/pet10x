"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { Toaster } from "@/components/ui/sonner"
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
  const router = useRouter()
  useEffect(() => {
    if (isAuthenticated) router.replace("/app")
  }, [isAuthenticated, router])

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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <Link href="/app" className="mb-6 flex w-fit items-center gap-1 text-[14px] text-primary">
          <ArrowLeft className="h-4 w-4" /> Pet owner? Sign in here
        </Link>
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-info/10">
            <Building2 className="h-7 w-7 text-info" />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold text-foreground">Building Manager</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Sign in to manage your building</p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoCapitalize="none"
              className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          {info && <p className="text-[13px] text-success">{info}</p>}
          <button
            onClick={submit}
            disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-info py-3 text-[15px] font-semibold text-info-foreground disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
          <button onClick={forgot} className="text-center text-[13px] font-medium text-primary">
            Forgot password?
          </button>
        </div>
        <p className="mt-6 text-center text-[12px] leading-relaxed text-muted-foreground">
          Managers are added by invitation. Ask your Pet10x admin if you don&apos;t have an account.
        </p>
      </div>
    </div>
  )
}
