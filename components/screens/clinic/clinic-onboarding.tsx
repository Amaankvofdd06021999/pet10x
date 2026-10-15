"use client"

import { useState } from "react"
import Link from "next/link"
import { Stethoscope, ArrowRight } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/select"
import { SectionCard } from "@/components/ui/section-card"
import { Spinner } from "@/components/ui/spinner"
import { useBusinessTypes } from "@/lib/data/business-types"
import { clinicSignupHref, readTargetParam } from "@/lib/navigation"
import { dbErrorMessage } from "@/lib/data/db-error"
import { ErrorText } from "@/components/ui/error-text"

/** Plain-English names for the console modules a type turns on. */
const MODULE_BLURB: Record<string, string> = {
  schedule: "A multi-provider appointment calendar",
  bookings: "Job requests and a booking queue",
  clients: "Customers and their animals",
  medical: "Vaccinations, visits and clinical history",
  grooming: "Coat, style and grooming notes",
  boarding: "Runs, stays and feeding plans",
  daycare: "Attendance and play groups",
  classes: "Courses and enrolment",
  reminders: "A call list and reminders that book in one tap",
  shop: "A retail catalogue and simple stock",
  invoices: "Estimates, invoices and payments",
  emergency: "On-call cover and inbound emergencies",
  records_sharing: "Records owners choose to share with you",
  storefront: "A public listing once you are verified",
  team: "Staff, roles and locations",
}

/** A practice signs itself in. No verification needed to reach the console. */
export function ClinicSignIn() {
  const { signInWithPassword, resetPassword } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /* Create account comes back to /clinic afterwards — with the notification
     link this console was opened from, which waits in `?target=` until the
     reader is signed in (app/clinic/page.tsx). Read at the tap, not at render,
     so the server and the first client render agree on the plain href. */
  const openSignup = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = readTargetParam(window.location.search)
    if (!target) return
    e.preventDefault()
    window.location.assign(clinicSignupHref(target))
  }

  // The same reset email /login sends (lib/auth-context resetPassword).
  async function forgot() {
    setError(null)
    setInfo(null)
    if (!email.trim()) return setError("Enter your email first, then tap “Forgot password?”.")
    const res = await resetPassword(email.trim())
    if (res.error) setError(res.error)
    else setInfo(`Password reset link sent to ${email.trim()}.`)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError("Enter your email and password.")
      return
    }
    setBusy(true)
    setError(null)
    const res = await signInWithPassword(email.trim(), password)
    if (res.error) {
      setError(res.error)
      setBusy(false)
    }
    // On success the provider swaps this view out.
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft">
            <Stethoscope className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h1 className="mt-3 text-heading font-semibold text-foreground">Pet10x for practices</h1>
          <p className="mt-1 text-meta text-muted-foreground">
            Sign in to your practice console.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <Field label="Email" required>
            {(p) => (
              <Input
                {...p}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@practice.com"
              />
            )}
          </Field>
          <Field label="Password" required error={error}>
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" loading={busy} className="mt-1 w-full">
            Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          {info && <p role="status" className="text-center text-caption text-foreground">{info}</p>}
          <button type="button" onClick={() => void forgot()} className="text-center text-meta font-medium text-foreground">
            Forgot password?
          </button>
          <p className="text-center text-caption text-muted-foreground">
            New here?{" "}
            <Link href={clinicSignupHref(null)} onClick={openSignup} className="font-semibold text-foreground">
              Create an account
            </Link>
            , then register your practice on the next screen.
          </p>
        </div>
      </form>
    </div>
  )
}

/**
 * Self-serve practice registration.
 *
 * Everything a practice does with its OWN data works from this moment. The
 * capabilities that touch somebody else's records — receiving shared records,
 * publishing them back, emergency access — wait for verification.
 */
export function RegisterPractice({
  onCreated,
  error,
}: {
  onCreated: () => void
  error: string | null
}) {
  const { user, signOut } = useAuth()
  const types = useBusinessTypes()
  const [name, setName] = useState("")
  const [kind, setKind] = useState("veterinary")
  const [city, setCity] = useState("")
  const [phoneless, setPhoneless] = useState("")
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  async function create() {
    if (!name.trim()) {
      setFailed("What is the practice called?")
      return
    }
    const db = getSupabaseBrowserClient()
    if (!db) {
      setFailed("Supabase is not configured.")
      return
    }
    setBusy(true)
    setFailed(null)
    const { data: auth } = await db.auth.getUser()
    const uid = auth.user?.id
    if (!uid) {
      setFailed("Your session expired. Sign in again.")
      setBusy(false)
      return
    }
    const { error: insErr } = await db.from("businesses").insert({
      owner_id: uid,
      name: name.trim(),
      category: kind === "veterinary" ? "Veterinary" : kind,
      business_kind: kind,
      city: city.trim() || null,
      region: "BC",
      address: phoneless.trim() || null,
    })
    if (insErr) {
      setFailed(dbErrorMessage(insErr, "Couldn't create your practice. Try again."))
      setBusy(false)
      return
    }
    onCreated()
    setBusy(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft">
            <Stethoscope className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h1 className="mt-3 text-heading font-semibold text-foreground">Register your practice</h1>
          <p className="mt-1 text-meta text-muted-foreground">
            Two minutes, and you can book tomorrow&apos;s appointments.
          </p>
        </div>
        <SectionCard>
          <div className="flex flex-col gap-3">
            <Field label="Practice name" required error={failed}>
              {(p) => (
                <Input
                  {...p}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Westside Veterinary Clinic"
                />
              )}
            </Field>
            <Field
              label="Type of business"
              hint={types.data.find((t) => t.code === kind)?.description ?? undefined}
            >
              {(p) =>
                types.isLoading ? (
                  <Spinner label="Loading types" />
                ) : (
                  <NativeSelect {...p} value={kind} onChange={(e) => setKind(e.target.value)}>
                    {types.data.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.label}
                      </option>
                    ))}
                  </NativeSelect>
                )
              }
            </Field>
            <Field label="Address" hint="Used for your listing once you verify.">
              {(p) => (
                <Input
                  {...p}
                  value={phoneless}
                  onChange={(e) => setPhoneless(e.target.value)}
                  placeholder="1820 W 4th Ave"
                />
              )}
            </Field>
            <Field label="City">
              {(p) => (
                <Input {...p} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Vancouver" />
              )}
            </Field>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-caption font-semibold text-foreground">What you get right away</p>
              <ul className="mt-1 list-disc pl-4 text-caption text-muted-foreground">
                {(types.data.find((t) => t.code === kind)?.modules ?? []).map((m) => (
                  <li key={m}>{MODULE_BLURB[m] ?? m.replace(/_/g, " ")}</li>
                ))}
                <li>Everything works whether or not your customers use Pet10x</li>
              </ul>
              <p className="mt-2 text-caption font-semibold text-foreground">After verification</p>
              <ul className="mt-1 list-disc pl-4 text-caption text-muted-foreground">
                <li>Appear in Pet10x search and take online bookings</li>
                <li>Receive records owners choose to share, and hand records back</li>
              </ul>
            </div>
            <Button onClick={() => void create()} loading={busy} className="w-full">
              Create practice
            </Button>
            {error && <ErrorText className="text-caption">{error}</ErrorText>}
            <p className="text-center text-caption text-muted-foreground">
              Signed in as {user?.email}.{" "}
              <button type="button" onClick={() => void signOut()} className="underline">
                Sign out
              </button>
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
