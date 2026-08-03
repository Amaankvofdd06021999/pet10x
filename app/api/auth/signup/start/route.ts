import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { sendSignupCodeEmail, sendSignupExistingAccountEmail } from "@/lib/email"
import {
  CODE_TTL_MINUTES,
  CODE_TTL_MS,
  MAX_SENDS,
  RESEND_COOLDOWN_SECONDS,
  generateCode,
  hashCode,
  isValidEmail,
  normaliseEmail,
} from "@/lib/auth/signup-otp"

/**
 * Step 1 of signup: park the attempt and email a 6-digit code.
 *
 * Nothing is created in `auth.users` here — that is the entire point. The
 * caller's password is not accepted at this step and never reaches the server
 * until the code is verified, so an unverified signup leaves no account and no
 * credential behind.
 */
export const runtime = "nodejs"

/**
 * One response shape for every outcome that isn't a client error.
 *
 * Registered and unregistered addresses must be indistinguishable from the
 * outside, or this endpoint becomes a way to test which emails are on Pet10x.
 * The person who owns the address is told what happened by email instead.
 */
const OK = (extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: true, expiresInMinutes: CODE_TTL_MINUTES, ...extra })

export async function POST(request: Request) {
  let body: { email?: string; fullName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const email = normaliseEmail(body.email ?? "")
  const fullName = body.fullName?.trim() || null

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // Clear anything already expired for this address before reading it, so a
  // stale row can never make a fresh attempt look rate-limited.
  await admin.from("pending_signups").delete().eq("email", email).lt("expires_at", new Date().toISOString())

  const { data: registered, error: lookupError } = await admin.rpc("email_is_registered", { p_email: email })
  if (lookupError) {
    console.error("[signup/start] registration lookup failed", lookupError)
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 })
  }

  if (registered) {
    // Same response as a fresh signup; the truth goes to the inbox only.
    await sendSignupExistingAccountEmail({ to: email }).catch((e) =>
      console.error("[signup/start] existing-account email failed", e),
    )
    return OK()
  }

  const { data: existing } = await admin
    .from("pending_signups")
    .select("send_count, last_sent_at")
    .eq("email", email)
    .maybeSingle()

  if (existing) {
    const since = (Date.now() - new Date(existing.last_sent_at).getTime()) / 1000
    if (since < RESEND_COOLDOWN_SECONDS) {
      // Not an error — the previous code is still valid and still in their
      // inbox. Tell the UI how long until a resend is allowed.
      return OK({ resent: false, retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - since) })
    }
    if (existing.send_count >= MAX_SENDS) {
      return NextResponse.json(
        { error: "Too many codes requested. Wait for the current code to expire, then try again." },
        { status: 429 },
      )
    }
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()

  // Upsert on the email PK: a resend replaces the code rather than leaving the
  // previous one live, and resets the attempt counter for the new code.
  const { error: writeError } = await admin.from("pending_signups").upsert(
    {
      email,
      code_hash: hashCode(code, email),
      full_name: fullName,
      expires_at: expiresAt,
      attempts: 0,
      send_count: (existing?.send_count ?? 0) + 1,
      last_sent_at: new Date().toISOString(),
    },
    { onConflict: "email" },
  )

  if (writeError) {
    console.error("[signup/start] could not store pending signup", writeError)
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 })
  }

  // Outside production `send()` suppresses delivery, which would make the flow
  // impossible to exercise locally. Log the code there and only there.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[signup/start] verification code for ${email}: ${code}`)
  }

  const result = await sendSignupCodeEmail({ to: email, code, minutes: CODE_TTL_MINUTES }).catch((e) => {
    console.error("[signup/start] code email threw", e)
    return { error: e } as const
  })

  if (result && "error" in result && result.error) {
    // The code is unusable if it never arrives — drop the row so the address
    // is not left in cooldown for a code nobody has.
    await admin.from("pending_signups").delete().eq("email", email)
    console.error("[signup/start] code email failed", result.error)
    return NextResponse.json({ error: "We couldn't send the code. Check the address and try again." }, { status: 502 })
  }

  return OK({ resent: true })
}
