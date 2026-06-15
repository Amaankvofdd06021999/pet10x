import "server-only"
import { Resend } from "resend"

/**
 * Transactional email via Resend. SERVER ONLY. Auth emails (confirm, magic link,
 * reset) are sent by Supabase's own SMTP (also Resend); these helpers are for
 * app-driven emails (manager invites, notifications).
 *
 * Emails are suppressed unless NODE_ENV=production AND a key is present, so we
 * never email real people during local dev. The Vercel project provides the key
 * as `resend` (we also accept the standard `RESEND_API_KEY`).
 */
const RESEND_KEY = process.env.RESEND_API_KEY ?? process.env.resend
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null

const FROM = process.env.EMAIL_FROM ?? "Pet10x <noreply@pet10x.com>"
const APP_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.pet10x.com"
const EMAIL_ENABLED = process.env.NODE_ENV === "production" && !!resend

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
          Pet10x · Park10x Services Inc.<br/>A governance &amp; management tool — not legal advice or a life-safety system.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function send(opts: { to: string | string[]; subject: string; html: string }) {
  if (!EMAIL_ENABLED) {
    console.log(`[email] suppressed (dev or no key): "${opts.subject}" -> ${Array.isArray(opts.to) ? opts.to.join(", ") : opts.to}`)
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
