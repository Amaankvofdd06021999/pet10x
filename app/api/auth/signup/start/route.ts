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
import { decideStart, parseSignupIntent } from "@/lib/auth/signup-intent"

/**
 * Step 1 of signup: park the attempt and email a 6-digit code.
 *
 * Nothing is created in `auth.users` here — that is the entire point. The
 * caller's password is not accepted at this step and never reaches the server
 * until the code is verified, so an unverified signup leaves no account and no
 * credential behind.
 *
 * Residents and businesses both start here. A business signup posts
 * `intent: 'business'` with `businessName` and `category`; those ride on the
 * pending row and the verify route creates the business from them. Cooldown,
 * send cap and the code email are the same for both.
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
  let body: { email?: string; fullName?: string; intent?: unknown; businessName?: unknown; category?: unknown }
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

  const parsed = parseSignupIntent(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const intent = parsed.intent
  // Spelled out so it is a plain JSON object for the jsonb column.
  const business = parsed.business
    ? { businessName: parsed.business.businessName, category: parsed.business.category }
    : null

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
    .select("send_count, last_sent_at, intent, business, full_name")
    .eq("email", email)
    .maybeSingle()

  // An existing row's intent, business and name change ONLY together with a
  // fresh code sent to the inbox (lib/auth/signup-intent.ts decideStart). A
  // request that would change them inside the cooldown is refused, so nobody
  // who merely knows the address can flip what a stranger's live code creates.
  const decision = decideStart({
    existing,
    intent,
    business,
    nowMs: Date.now(),
    cooldownSeconds: RESEND_COOLDOWN_SECONDS,
    maxSends: MAX_SENDS,
  })
  if (decision.kind === "cooldown") {
    // Not an error — the previous code is still valid and still in their
    // inbox. Tell the UI how long until a resend is allowed.
    return OK({ resent: false, retryAfterSeconds: decision.retryAfterSeconds })
  }
  if (decision.kind === "conflict") {
    return NextResponse.json(
      {
        error: `A code was just sent to this address. Wait ${decision.retryAfterSeconds} seconds, then try again.`,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
      { status: 429 },
    )
  }
  if (decision.kind === "cap") {
    return NextResponse.json(
      { error: "Too many codes requested. Wait for the current code to expire, then try again." },
      { status: 429 },
    )
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()

  // Upsert on the email PK: a resend replaces the code rather than leaving the
  // previous one live, and resets the attempt counter for the new code.
  const { error: writeError } = await admin.from("pending_signups").upsert(
    {
      email,
      code_hash: hashCode(code, email, intent),
      // A resend that leaves the name out keeps the one already given.
      full_name: fullName ?? existing?.full_name ?? null,
      intent,
      business,
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
