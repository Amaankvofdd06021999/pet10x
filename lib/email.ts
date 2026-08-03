import "server-only"
import { Resend } from "resend"

/**
 * Transactional email via Resend. SERVER ONLY. Auth emails (confirm, magic link,
 * reset) are sent by Supabase's own SMTP (also Resend); these helpers are for
 * app-driven emails (manager invites, notifications).
 *
 * Emails are suppressed outside production so we never mail real people from a
 * dev machine. The Vercel project provides the key as `resend` (we also accept
 * the standard `RESEND_API_KEY`).
 *
 * That default makes anything email-dependent — signup verification above all,
 * where the code IS the flow — impossible to exercise locally. Set
 * `EMAIL_DEV_SEND=1` in .env.local (alongside a key) to send for real from dev.
 * It is opt-in per machine and never set in the deployed environments, so the
 * guard still holds by default.
 */
const RESEND_KEY = process.env.RESEND_API_KEY ?? process.env.resend
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null

const FROM = process.env.EMAIL_FROM ?? "Pet10x <noreply@pet10x.com>"
const APP_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.pet10x.com"
const EMAIL_ENABLED =
  !!resend && (process.env.NODE_ENV === "production" || process.env.EMAIL_DEV_SEND === "1")

interface TemplateOpts {
  headline: string
  body: string
  ctaUrl?: string
  ctaLabel?: string
  footnote?: string
}

/** Branded, light-theme HTML email. All styles inline (clients strip <style>). */
export function emailHtml({ headline, body, ctaUrl, ctaLabel, footnote }: TemplateOpts): string {
  const cta =
    ctaUrl && ctaLabel
      ? `<tr><td style="padding:8px 32px 4px"><a href="${ctaUrl}" style="display:inline-block;background:#FD9340;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${ctaLabel}</a></td></tr>`
      : ""
  const foot = footnote
    ? `<tr><td style="padding:4px 32px 8px;color:#9a9a9a;font-size:12px;line-height:1.5">${footnote}</td></tr>`
    : ""
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #ececec;border-radius:14px;overflow:hidden">
        <tr><td style="padding:22px 32px;border-bottom:1px solid #f0f0f0">
          <span style="display:inline-block;width:26px;height:26px;background:#FD9340;border-radius:7px;vertical-align:middle"></span>
          <span style="color:#1f1f1f;font-weight:600;font-size:17px;letter-spacing:-0.01em;margin-left:8px;vertical-align:middle">Pet10x</span>
        </td></tr>
        <tr><td style="padding:28px 32px 8px"><h1 style="margin:0;color:#1f1f1f;font-size:22px;font-weight:600;letter-spacing:-0.01em">${headline}</h1></td></tr>
        <tr><td style="padding:6px 32px 16px;color:#555;font-size:15px;line-height:1.6">${body}</td></tr>
        ${cta}
        ${foot}
        <tr><td style="padding:20px 32px;border-top:1px solid #f0f0f0;color:#9a9a9a;font-size:12px;line-height:1.5">
          Pet10x<br/>A governance &amp; management tool — not legal advice or a life-safety system.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function send(opts: { to: string | string[]; subject: string; html: string }) {
  if (!EMAIL_ENABLED) {
    const why = !resend ? "no RESEND_API_KEY/resend key" : "not production and EMAIL_DEV_SEND is not 1"
    console.log(
      `[email] suppressed (${why}): "${opts.subject}" -> ${Array.isArray(opts.to) ? opts.to.join(", ") : opts.to}`,
    )
    return { suppressed: true as const }
  }
  return resend!.emails.send({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html })
}

/* ------------------------------------------------------------------ */
/* App emails                                                          */
/* ------------------------------------------------------------------ */

export function sendManagerInviteEmail(opts: { to: string; inviteUrl: string; buildingName?: string; inviterName?: string }) {
  return send({
    to: opts.to,
    subject: "You've been invited to manage on Pet10x",
    html: emailHtml({
      headline: "You're invited to Pet10x",
      body: `${opts.inviterName ?? "Your building"} invited you to manage ${
        opts.buildingName ?? "their building"
      } on Pet10x — the pet governance, risk &amp; community platform. Set your password to get started.`,
      ctaUrl: opts.inviteUrl,
      ctaLabel: "Accept invite & set password",
      footnote: "This invite link expires in 24 hours. If you weren't expecting this, you can ignore this email.",
    }),
  })
}

/**
 * The 6-digit signup code.
 *
 * No link and no CTA button on purpose: there is nothing to click, and a
 * clickable "verify" in a code email is exactly the shape a phishing lookalike
 * wants to copy. The code is rendered large enough to read off a phone.
 */
export function sendSignupCodeEmail(opts: { to: string; code: string; minutes: number }) {
  const spaced = `${opts.code.slice(0, 3)} ${opts.code.slice(3)}`
  return send({
    to: opts.to,
    subject: `${opts.code} is your Pet10x verification code`,
    html: emailHtml({
      headline: "Verify your email",
      body:
        `Enter this code in Pet10x to finish creating your account:` +
        `<div style="margin:20px 0 6px;padding:16px 20px;background:#FFF6EE;border:1px solid #FBDCC2;border-radius:10px;text-align:center">` +
        `<span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#1F1F1F">${spaced}</span>` +
        `</div>` +
        `<p style="margin:12px 0 0;color:#555">This code expires in ${opts.minutes} minutes.</p>`,
      footnote:
        "If you didn't try to create a Pet10x account, you can ignore this email — no account has been created, and none will be without this code.",
    }),
  })
}

/**
 * Sent instead of a code when the address already has an account.
 *
 * The signup endpoint answers identically whether or not an address is
 * registered, so it cannot be used to test which emails are on Pet10x. The
 * person who actually owns the address still needs to know what happened, and
 * this is the only channel that reaches exactly them.
 */
export function sendSignupExistingAccountEmail(opts: { to: string }) {
  return send({
    to: opts.to,
    subject: "You already have a Pet10x account",
    html: emailHtml({
      headline: "You already have an account",
      body:
        "Someone just tried to create a Pet10x account with this email address. You already have one, so we didn't create another. " +
        "Sign in with your password instead — or reset it if you've forgotten it.",
      ctaUrl: `${APP_URL}/login`,
      ctaLabel: "Sign in",
      footnote: "If this wasn't you, nothing has changed on your account and there's nothing you need to do.",
    }),
  })
}

export function sendWelcomeEmail(opts: { to: string; name?: string }) {
  return send({
    to: opts.to,
    subject: "Welcome to Pet10x",
    html: emailHtml({
      headline: `Welcome${opts.name ? `, ${opts.name}` : ""}!`,
      body: "Your Pet10x account is ready. Register your pets, stay in good standing with your building, and connect with your community.",
      ctaUrl: `${APP_URL}/app`,
      ctaLabel: "Open Pet10x",
    }),
  })
}

/**
 * "Your building needs a few details."
 *
 * The chase half of the completeness loop. Email rather than in-app alone
 * because the residents who have filled nothing in are, by definition, the
 * ones not opening the app. The missing items are listed literally so the
 * recipient can gather them before opening anything.
 */
export function sendRequestInfoEmail(opts: {
  to: string
  name?: string
  buildingName: string
  missing: string[]
}) {
  const items =
    opts.missing.length > 0
      ? `<ul style="margin:12px 0 0;padding-left:20px;color:#1F1F1F;">${opts.missing
          .map((m) => `<li style="margin:4px 0;">${m}</li>`)
          .join("")}</ul>`
      : ""

  return send({
    to: opts.to,
    subject: `${opts.buildingName} needs a few details`,
    html: emailHtml({
      headline: `A few details still needed${opts.name ? `, ${opts.name}` : ""}`,
      body:
        `${opts.buildingName} can't finish registering you until these are on file:` +
        items +
        `<p style="margin:14px 0 0;">Each one takes a moment in the app.</p>`,
      ctaUrl: `${APP_URL}/app`,
      ctaLabel: "Complete my registration",
      footnote: "You're receiving this because you asked to link to this building on Pet10x.",
    }),
  })
}
