# Email System Guide — ProdBeast Architecture

How the transactional email system works in this project, and how to replicate it in a new Next.js + Supabase app.

---

## Stack

| Layer | What it does |
|---|---|
| **Resend** | Sends the actual emails (SMTP replacement, developer-friendly API) |
| **Supabase Auth Admin SDK** | Generates invite links without Supabase sending its own email |
| **Next.js API Routes** | Triggers emails server-side; never from the client |

---

## 1. Setup

### Install Resend

```bash
npm install resend
```

### Environment variables

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
NEXT_PUBLIC_BASE_URL=https://yourdomain.com

# Supabase service role key — only for server-side use
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

### Resend dashboard steps
1. Sign up at resend.com
2. Add your domain (e.g. `yourdomain.com`) under **Domains**
3. Add the DNS records they give you (SPF, DKIM, DMARC)
4. Wait for verification (usually < 30 minutes)
5. Create an API key under **API Keys**

Your `from` address must use the verified domain:
```ts
const FROM = 'YourApp <noreply@yourdomain.com>';
```

---

## 2. The Email Library (`lib/email.ts`)

Centralise all email sending in one file. Never call `resend.emails.send()` from route files directly.

```ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'YourApp <noreply@yourdomain.com>';
const APP_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://yourdomain.com';

// Only send in production — suppresses emails during local dev
const EMAIL_ENABLED = process.env.NODE_ENV === 'production';
```

### Key pattern: suppress in dev

```ts
export async function sendSomeEmail({ ... }) {
  if (!EMAIL_ENABLED) {
    console.log('[email] suppressed in dev');
    return;
  }
  await resend.emails.send({ ... });
}
```

This means you never accidentally email real users while developing.

### Key pattern: non-fatal fire-and-forget

For notifications triggered by user actions (status changes, comments), wrap the email in a try/catch and don't await it from the main response path:

```ts
// In your API route — fire-and-forget, doesn't block the response
(async () => {
  try {
    await sendStatusChangeEmail({ ... });
  } catch (e) {
    console.warn('[email trigger]', e);
  }
})();

return NextResponse.json({ ok: true }); // returns immediately
```

This way a failed email never breaks the user's action.

---

## 3. Invite Flow (the tricky part)

The standard Supabase invite (`supabase.auth.admin.inviteUserByEmail`) sends its own plain email with its own template — you can't fully customize it.

### The workaround: `generateLink` + your own email

```ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service role, never expose client-side
);

// Generate the invite link without Supabase sending anything
const { data: linkData, error } = await supabase.auth.admin.generateLink({
  type: 'invite',
  email: userEmail,
  options: {
    redirectTo: 'https://yourdomain.com/set-password', // where to land after clicking
    data: { full_name: userName },                      // stored in user metadata
  },
});

const inviteLink = linkData?.properties?.action_link;
// Then send this link in your own Resend email
```

`action_link` is a Supabase magic link that:
1. Establishes an auth session in the browser automatically (via URL hash)
2. Redirects to your `redirectTo` URL
3. Expires in 24 hours

### The `/set-password` page

After clicking the invite link, users land on a page where they set their password. Supabase has already established a session from the hash — the page just needs to wait for it:

```tsx
useEffect(() => {
  void (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Hash hasn't been processed yet — wait for auth state change
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, s) => {
          if (s) { subscription.unsubscribe(); setReady(true); }
        }
      );
      return;
    }
    setReady(true);
  })();
}, []);
```

Once ready, call `supabase.auth.updateUser({ password })` to set the password, then redirect to the app.

### Supabase Auth URL configuration (required)

In Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://yourdomain.com`
- **Redirect URLs**: add `https://yourdomain.com/set-password` (and `https://*.yourdomain.com/**` if using subdomains)

Without this, the invite link redirect will be blocked by Supabase.

---

## 4. Email Types in This Project

### Invite email
- **Trigger**: Admin POSTs to `/api/admin/invite`
- **When**: New user is invited to the platform
- **Contains**: Invite link, org name, inviter name, role

### Status change email
- **Trigger**: PATCH `/api/files/[id]` when `body.status` changes
- **When**: File moves to `approved`, `needs_changes`, `denied`, `published`, or `pending`
- **Who gets it**:
  - Vendor (uploader) — when their file is reviewed or published
  - All internal users with `emailNotifications: true` — when a new file is submitted (`pending`)
- **Important**: Scoped by `orgId` so org A users don't get org B emails

### Comment email
- **Trigger**: POST `/api/comments`
- **When**: Someone leaves a comment on a video file
- **Who gets it**:
  - @mentioned users get it if they're in the system
  - Otherwise, the file uploader gets it (if `emailNotifications: true` and not the commenter themselves)

---

## 5. Email HTML Template Pattern

All emails use inline styles (no CSS files) because email clients strip `<style>` tags. The pattern used here:

```ts
function emailHtml({ headline, body, color, ctaUrl, ctaLabel }) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="560" style="background:#111;border:1px solid #1F1F1F;border-radius:12px;">
        <!-- Accent header -->
        <tr><td style="background:${color}22;border-bottom:2px solid ${color};padding:20px 32px">
          <span style="color:${color};font-weight:700;letter-spacing:0.1em">YOUR APP</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px">
          <h1 style="color:#F0F0F0">${headline}</h1>
          <p style="color:#B0B0B0">${body}</p>
          <a href="${ctaUrl}" style="background:${color};color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">${ctaLabel}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
```

Rules:
- All styles inline, never in `<style>` tags
- Use `<table>` for layout, not `<div>` flex (Outlook)
- Test with [mail.google.com](https://mail.google.com) and Apple Mail at minimum

---

## 6. Database: `emailNotifications` flag

Users have an `emailNotifications` boolean column. Respect it:

```ts
const { data: users } = await db
  .from('User')
  .select('email, name')
  .eq('role', 'internal')
  .eq('emailNotifications', true)  // only opted-in users
  .eq('orgId', orgId);             // only same org
```

Default it to `true` on insert, give users a toggle in their profile settings.

---

## 7. Checklist for a New Project

- [ ] Sign up for Resend, verify your domain
- [ ] Add `RESEND_API_KEY` and `NEXT_PUBLIC_BASE_URL` to env
- [ ] Create `lib/email.ts` with `EMAIL_ENABLED = process.env.NODE_ENV === 'production'`
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to env (never expose in client code)
- [ ] Create `lib/supabase-admin.ts` that initialises the Supabase client with the service role key
- [ ] Use `supabase.auth.admin.generateLink({ type: 'invite', ... })` instead of `inviteUserByEmail`
- [ ] Create `/set-password` page that waits for auth session then calls `updateUser`
- [ ] Add redirect URLs in Supabase dashboard → Authentication → URL Configuration
- [ ] Add `emailNotifications` boolean to your User table
- [ ] Wrap all email calls in try/catch — never let a failed email break a user action

---

## 8. Resend Free Tier

- 3,000 emails/month free
- 1 domain
- No credit card needed

More than enough for early-stage SaaS. Upgrade when you're doing > 3k emails/month.
