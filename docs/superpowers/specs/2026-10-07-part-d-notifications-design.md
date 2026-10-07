# Part D — notifications that reach people

Date: 2026-10-07. Branch: `pet10x-gaps`. Migration numbers: `20261011000001…`.
SMS is out of scope (decided 2026-10-07). Channels: in-app (exists), email
(Resend), web push (VAPID).

## 1. Missing in-app notifications

Every notification is written by a `SECURITY DEFINER` function (the only
client insert policy is `kind='assistant'` for self).

- `incident_reports` AFTER INSERT trigger (definer): notify every manager of
  the report's building, kind `incident`, title with the incident type and
  reference code, action target to the manager's incident view. Guest reports
  included. Never include the reporter's contact details in the body.
- `service_bookings` AFTER INSERT trigger: notify the business owner (kind
  `appointment`), action target to the business bookings tab.
- `service_bookings` AFTER UPDATE OF status trigger: notify the customer on
  `confirmed`, `declined`, `completed` (kind `appointment`), action target to
  My Bookings.
- Add the action targets to `lib/navigation.ts` (with tests), checking the
  existing target grammar first.
- Check whether Part E already added the invoice-sent notification; do not
  duplicate.

## 2. Preferences

- Migration: `profiles.notify_email boolean not null default true`,
  `profiles.notify_push boolean not null default true`. Ensure
  `guard_profile_privilege` does not block owners from changing them.
- Resident Profile gets a **Notifications** row → a sheet with two switches
  (Email, Push on this device) and a short description of what each sends.
  The Push switch drives browser subscription (section 4). Managers,
  businesses and clinics get the same sheet from their settings area.

## 3. Email delivery — a dispatcher, not scattered sends

- Migration: `notifications.emailed_at timestamptz`, `notifications.pushed_at
  timestamptz`, partial indexes on each where null.
- New cron route `app/api/notifications/dispatch/route.ts` (CRON_SECRET bearer,
  service role, structure copied from `app/api/care/reminders/run/route.ts`),
  scheduled every 5 minutes in `vercel.json`.
- Email pass: notifications created in the last 24 h, `emailed_at is null`,
  `read_at is null`, created more than 2 minutes ago (so an in-app read
  suppresses the email), recipient `notify_email = true`, kind in
  `incident, appointment, clinic, reminder, compliance, building, billing`
  (not `assistant`, `care`, `community` — those are push-only). Group per
  recipient: one notification → a single email; several → one digest email
  listing them. Mark `emailed_at` on success only. Cap per run (e.g. 200
  recipients) so a backlog drains over several runs.
- New `sendNotificationEmail` / `sendNotificationDigest` in `lib/email.ts`.
  **HTML-escape every interpolated value** (titles and bodies contain user
  text); add an `escapeHtml` helper with tests and use it in the existing
  senders too.
- The CTA links to `NEXT_PUBLIC_BASE_URL/app` with the action target encoded
  so the app opens the right screen (check how `/app` reads deep links; add a
  `?target=` handler that runs `resolveActionTarget` if none exists).
- Respect the existing dev suppression flag.

## 4. Web push

- Migration: table `web_push_subscriptions (id, profile_id → profiles on
  delete cascade, endpoint text unique, p256dh text, auth text, user_agent
  text, created_at, last_used_at)`, RLS own rows only. Leave the Expo-shaped
  `push_tokens` alone.
- `public/sw.js` service worker: shows the notification (title, body, icon
  `/icon.svg`), and on click focuses/opens `/app?target=…`. Plus
  `app/manifest.ts` (name, icons, theme colour) so iOS home-screen web apps
  can receive push.
- Client helper `lib/push.ts`: feature-detect, register the worker, request
  permission only from the Push switch (never on load), subscribe with
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, upsert the subscription; unsubscribe on
  switch-off and on sign-out.
- Dispatcher push pass: notifications with `pushed_at is null` created in the
  last 24 h for recipients with `notify_push = true` and at least one
  subscription; send with the `web-push` package (`VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`); delete subscriptions answering 404/410; mark `pushed_at`.
  Push applies to all kinds.
- Add the three VAPID variables and `EMAIL_FROM` to `.env.example` with a
  generation note (`npx web-push generate-vapid-keys`). With keys absent the
  push pass is skipped and the Push switch is hidden — never a broken switch.

## 5. Clinic reminder channels

The reminder rules offer Email and SMS but nothing sends either.
- Remove SMS from the rule channel options (and from any check constraint the
  UI relies on — leave historic data valid).
- For Email-channel rules, the reminder's `notify` action already writes an
  owner notification (kind `reminder`); the dispatcher emails it. Make the UI
  copy say "Sends an in-app notification and an email to the owner".

## 6. Care reminders route

Remove the "deliberately not push" comment in
`app/api/care/reminders/run/route.ts` once push exists; its notifications are
picked up by the dispatcher like any other.

## Testing
- Unit: `escapeHtml`, digest grouping, eligibility filter (kind / read /
  prefs / age), deep-link target parsing.
- SQL `supabase/tests/part-d.sql`: incident insert notifies exactly the
  building's managers; booking insert/status change notifies the right person;
  a user can only see/insert their own push subscriptions.
- `pnpm test`, `tsc --noEmit`, `pnpm build` green.
