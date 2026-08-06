import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { sendWelcomeEmail } from "@/lib/email"
import { checkPassword } from "@/lib/auth/password-rules"
import {
  MAX_ATTEMPTS,
  codeMatches,
  isSixDigits,
  isValidEmail,
  normaliseEmail,
} from "@/lib/auth/signup-otp"

/**
 * Step 2 of signup: check the code, then create the account.
 *
 * This is the only place in the app that creates a user. The password arrives
 * here for the first time — it was held in the browser across the code step —
 * so an unverified attempt never puts a credential on our side.
 *
 * ORDER MATTERS. The account is created first and the pending row deleted
 * after. A failure between the two leaves a harmless orphan that the expiry
 * sweep collects; the reverse order could consume the code and then fail to
 * create anything, stranding the person with no account and no way back in.
 *
 * Once created, an account is permanent as far as this flow is concerned.
 * Nothing here, and nothing in the expiry sweep, can reach auth.users — the
 * sweep deletes from public.pending_signups only, and a verified signup has no
 * row there to find.
 */
export const runtime = "nodejs"

export async function POST(request: Request) {
  let body: { email?: string; code?: string; password?: string; fullName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const email = normaliseEmail(body.email ?? "")
  const code = (body.code ?? "").trim()
  const password = body.password ?? ""
  const fullName = body.fullName?.trim() || null

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }
  if (!isSixDigits(code)) {
    return NextResponse.json({ error: "Enter the 6-digit code from your email." }, { status: 400 })
  }
  // The same function the signup form ticks off live. Enforced here because a
  // client-side checklist stops nobody posting straight to this endpoint.
  const verdict = checkPassword(password)
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.failed[0] }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: pending, error: readError } = await admin
    .from("pending_signups")
    .select("email, code_hash, full_name, expires_at, attempts")
    .eq("email", email)
    .maybeSingle()

  if (readError) {
    console.error("[signup/verify] could not read pending signup", readError)
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 })
  }

  // Missing and expired are reported the same way. Distinguishing them would
  // say whether a signup is in flight for an address we are otherwise careful
  // not to confirm.
  const expired = !pending || new Date(pending.expires_at).getTime() <= Date.now()
  if (expired) {
    if (pending) await admin.from("pending_signups").delete().eq("email", email)
    return NextResponse.json(
      { error: "That code has expired. Request a new one.", expired: true },
      { status: 400 },
    )
  }

  if (pending.attempts >= MAX_ATTEMPTS) {
    await admin.from("pending_signups").delete().eq("email", email)
    return NextResponse.json(
      { error: "Too many incorrect attempts. Request a new code.", expired: true },
      { status: 429 },
    )
  }

  if (!codeMatches(code, email, pending.code_hash)) {
    const attempts = pending.attempts + 1
    await admin.from("pending_signups").update({ attempts }).eq("email", email)
    const left = MAX_ATTEMPTS - attempts
    return NextResponse.json(
      {
        error:
          left > 0
            ? `That code isn't right. ${left} attempt${left === 1 ? "" : "s"} left.`
            : "Too many incorrect attempts. Request a new code.",
        expired: left <= 0,
      },
      { status: 400 },
    )
  }

  /* Verified. Create the real account. */
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // The code *was* the email check, so the address is confirmed by the time
    // we get here. Without this the account would be created unconfirmed and
    // the password sign-in that follows would be refused.
    email_confirm: true,
    user_metadata: { full_name: pending.full_name ?? fullName },
  })

  if (createError || !created?.user) {
    const message = createError?.message ?? "unknown error"
    // Lost a race with a concurrent verify, or the address was registered
    // between start and verify. Either way an account exists — clear the
    // pending row and send them to sign-in rather than retrying forever.
    if (/already.*registered|already.*exists|duplicate/i.test(message)) {
      await admin.from("pending_signups").delete().eq("email", email)
      return NextResponse.json(
        { error: "An account with this email already exists. Sign in instead." },
        { status: 409 },
      )
    }
    console.error("[signup/verify] createUser failed", createError)
    // Pending row deliberately left in place: the code is still valid, so a
    // retry costs the person nothing.
    return NextResponse.json({ error: "We couldn't create your account. Try again." }, { status: 500 })
  }

  // The account now exists and is confirmed. From this point the pending row
  // is bookkeeping only — losing this delete cannot affect the account.
  const { error: cleanupError } = await admin.from("pending_signups").delete().eq("email", email)
  if (cleanupError) {
    console.error("[signup/verify] pending row left behind (harmless, expires on its own)", cleanupError)
  }

  await sendWelcomeEmail({ to: email, name: pending.full_name ?? fullName ?? undefined }).catch((e) =>
    console.error("[signup/verify] welcome email failed", e),
  )

  return NextResponse.json({ ok: true })
}
