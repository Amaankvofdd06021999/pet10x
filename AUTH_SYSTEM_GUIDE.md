# Auth System Guide — ProdBeast Architecture

How authentication, sessions, role enforcement, and cross-subdomain login work in this project.

---

## Stack

| Layer | What it does |
|---|---|
| **Supabase Auth** | Manages sessions, password hashing, invite/reset tokens |
| **Supabase anon client** (`lib/supabase.ts`) | Used client-side — public key, safe to expose |
| **Supabase admin client** (`lib/supabase-admin.ts`) | Used server-side only — service role key, never expose |
| **AuthContext** (`lib/auth-context.tsx`) | React context — wraps the whole app, exposes `user`, `signIn`, `logout` |
| **`/api/auth/upsert`** | Server-side sync — maps Supabase auth user to the app's DB `User` row |

---

## 1. Two Supabase Clients

### Anon client — `lib/supabase.ts`

```ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // safe to expose
);
```

Use this everywhere in components and client-side code. It can only do what your Row Level Security (RLS) policies allow.

### Admin client — `lib/supabase-admin.ts`

```ts
import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // NEVER send to client
    { auth: { persistSession: false } },
  );
}
```

Use this **only in API routes and server-side code**. It bypasses RLS and has full database access. `persistSession: false` because the server doesn't maintain a session between requests.

---

## 2. Environment Variables

```env
# Public — baked into the client bundle at build time
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# Private — server only, never in NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Your app domain
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
```

---

## 3. AuthContext — the heart of client-side auth

`lib/auth-context.tsx` wraps the entire app and provides:

```ts
const { user, isAuthenticated, isLoading, signIn, logout } = useAuth();
```

### What happens on app load

1. `AuthProvider` mounts → calls `supabase.auth.getUser()` to check for an existing session
2. If a user is found → calls `/api/auth/upsert` to sync the Supabase user into the app's DB
3. Sets `user` state with data from the DB (role, name, orgId etc.)
4. Subscribes to `supabase.auth.onAuthStateChange` for all future events (sign in, sign out, token refresh)

```ts
// Simplified flow
const { data } = await supabase.auth.getUser();
if (data.user) {
  const res = await fetch('/api/auth/upsert', { method: 'POST', body: JSON.stringify({ id: data.user.id }) });
  const { user: dbUser } = await res.json();
  setUser({ ...supabaseUser, role: dbUser.role, prismaId: dbUser.id, ... });
}
```

### The `prismaId` gate

The login redirect is gated on `user.prismaId` being set — meaning the DB sync is complete:

```ts
// In login-page.tsx — only redirect after DB sync is done
useEffect(() => {
  if (!isAuthenticated || !user || !(user as any).prismaId) return;
  // safe to redirect now — role is authoritative
  router.push(user.role === 'vendor' ? '/vendor' : '/internal');
}, [isAuthenticated, user]);
```

Without this gate, the redirect would fire before we know the user's actual role from the DB, and they'd land on the wrong page.

---

## 4. `/api/auth/upsert` — Login Sync Route

This is called every time a user signs in. It:

1. Takes the Supabase user ID from the request body
2. Fetches the full Supabase user from the admin client (to verify it's real)
3. Looks up the matching `User` row in the app DB — first by `supabaseId`, then by email
4. If no DB row exists → returns `403` (the user was not invited; access denied)
5. If a row exists → stamps `supabaseId` onto it and returns the DB user

```ts
// The 403 is what locks out uninvited signups
if (!existing) {
  return NextResponse.json({ error: 'Access restricted. Contact your administrator.' }, { status: 403 });
}
```

This means Supabase Auth and the app DB are two separate layers:
- Supabase Auth holds credentials (email, password hash, session tokens)
- The app DB holds the user's role, orgId, name, and settings
- They are linked by `supabaseId` (the UUID Supabase assigns each auth user)

---

## 5. Login Page — `components/login-page.tsx`

### Mobile gate

Shown before anything else if `window.innerWidth < 768`. Uses a `useEffect` + `useState` to detect after hydration (can't use `window` during SSR):

```ts
const [isMobile, setIsMobile] = useState(false);
useEffect(() => { setIsMobile(window.innerWidth < 768); }, []);
if (isMobile) return <MobileGate />;
```

### Sign-in flow

```ts
const res = await signIn(email, password);
// signIn calls supabase.auth.signInWithPassword
// on success → onAuthStateChange fires → AuthProvider syncs → prismaId set → redirect triggers
```

### Error sanitization — never show raw Supabase errors to users

```ts
if (res.error) {
  const isRateLimit = /rate limit|too many|over limit/i.test(res.error);
  const isWrongCredentials = /invalid login|invalid credentials|wrong password|user not found|no user/i.test(res.error);
  const message = isRateLimit
    ? 'Please wait a moment before trying again.'
    : isWrongCredentials
    ? 'Incorrect email or password.'
    : 'Something went wrong. Please try again.';
  setError(message);
}
```

Raw Supabase error strings like `"invalid_credentials"` or `"Email not confirmed"` should never reach the user.

### Cross-subdomain redirect (multi-tenant)

After login on the root domain (`prodbeast.in`), users must be sent to their org's subdomain (`acme.prodbeast.in`). This is done by:

1. Detecting if we're on the root domain
2. Fetching `/api/org/me` to get the org's slug
3. Doing a full `window.location.href` redirect (not `router.push`) to the subdomain's `/auth/handoff` page with tokens in the URL

```ts
const isRootDomain = window.location.hostname === rootHost;
if (isRootDomain) {
  const org = await fetch('/api/org/me', { headers: { 'x-supabase-id': session.user.id } }).then(r => r.json());
  window.location.href =
    `https://${org.slug}.${rootHost}/auth/handoff` +
    `?access_token=${encodeURIComponent(session.access_token)}` +
    `&refresh_token=${encodeURIComponent(session.refresh_token)}` +
    `&next=${encodeURIComponent('/internal')}`;
}
```

**Why `window.location.href` instead of `router.push`?** Because `router.push` stays on the same domain. Moving to a subdomain requires a real browser navigation.

---

## 6. Cross-Subdomain Handoff — `/auth/handoff`

Supabase sessions are domain-scoped — a session established on `prodbeast.in` is not automatically available on `acme.prodbeast.in`.

The handoff page at `app/auth/handoff/page.tsx` receives the tokens as query params and manually sets the session:

```ts
const accessToken = searchParams.get('access_token');
const refreshToken = searchParams.get('refresh_token');
const next = searchParams.get('next') || '/internal';

supabase.auth
  .setSession({ access_token: accessToken, refresh_token: refreshToken })
  .then(({ error }) => {
    router.replace(error ? '/login' : next);
  });
```

This is safe because:
- Tokens are short-lived (default 1 hour for access token)
- The HTTPS connection encrypts them in transit
- The redirect target (`next`) is controlled by your own code

---

## 7. Invite Flow — `/set-password`

When a user receives an invite email and clicks the link:

1. The link goes to `acme.prodbeast.in/set-password#access_token=...` (Supabase appends tokens as a URL hash)
2. The Supabase client JS on the page processes the hash automatically and establishes a session
3. `/set-password` waits for this session to be ready, then lets the user pick a password
4. After `supabase.auth.updateUser({ password })` succeeds, fetches `/api/org/me` to determine the redirect

```ts
// Wait for session — hash may not be processed yet on first render
useEffect(() => {
  void (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
        if (s) { subscription.unsubscribe(); setReady(true); }
      });
      return;
    }
    setReady(true);
  })();
}, []);
```

---

## 8. Role System

Roles are stored in the app DB (`User.role`), not in Supabase. There are two roles:

| Role | Access |
|---|---|
| `internal` | Full dashboard, review files, manage settings, publish to YouTube |
| `vendor` | Upload files, view own file status, leave comments |

Role is read from the DB during the upsert sync and stamped onto the React `user` object. Routes check it server-side:

```ts
// In API routes
const { data: caller } = await db.from('User').select('role, orgId').eq('supabaseId', supabaseId).single();
if (caller.role !== 'internal') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
```

The `x-supabase-id` header is used as the auth token in all API calls — the client sends the Supabase user ID, the server validates it by looking it up in the DB.

---

## 9. Reset Password (not yet on login page)

The same `/set-password` page handles password reset with no changes. The flow:

1. Add a "Forgot password?" link on the login page
2. On submission call:
   ```ts
   await supabase.auth.resetPasswordForEmail(email, {
     redirectTo: 'https://yourdomain.com/set-password',
   });
   ```
3. Supabase emails a recovery link (or use `generateLink({ type: 'recovery', email })` + Resend for a custom email)
4. User lands on `/set-password` → session established from hash → same `updateUser({ password })` flow

---

## 10. Supabase Dashboard Config Checklist

In **Authentication → URL Configuration**:

- **Site URL**: `https://yourdomain.com`
- **Redirect URLs**:
  - `https://yourdomain.com/set-password`
  - `https://*.yourdomain.com/**` (if using subdomains)
  - `https://yourdomain.com/auth/handoff`

If a redirect URL isn't in this list, Supabase blocks the redirect and the invite/reset flow breaks silently.

---

## 11. Full Login Flow Diagram

```
User enters email + password on prodbeast.in/login
    │
    ▼
supabase.auth.signInWithPassword()
    │
    ▼
onAuthStateChange fires (SIGNED_IN)
    │
    ▼
/api/auth/upsert  ← POST with supabase user ID
    │  looks up User in DB by supabaseId or email
    │  if not found → 403, force sign out
    │  if found → stamps supabaseId, returns DB user
    ▼
AuthContext sets user.prismaId (DB sync complete)
    │
    ▼
Login page useEffect sees prismaId → triggers redirect
    │
    ├─ On root domain?
    │     ├─ Yes → fetch /api/org/me → get org slug
    │     │         window.location.href → acme.prodbeast.in/auth/handoff?tokens
    │     │                                      │
    │     │                                      ▼
    │     │                              supabase.setSession(tokens)
    │     │                                      │
    │     │                                      ▼
    │     │                              router.replace('/internal' or '/vendor')
    │     │
    │     └─ No (already on subdomain) → router.push('/internal' or '/vendor')
```

---

## 12. New Project Checklist

- [ ] Create Supabase project, copy URL + anon key + service role key
- [ ] Create `lib/supabase.ts` (anon client, with safe stub for missing env vars)
- [ ] Create `lib/supabase-admin.ts` (service role, `persistSession: false`)
- [ ] Create `lib/auth-context.tsx` with `AuthProvider` + `useAuth` hook
- [ ] Wrap `app/layout.tsx` with `<AuthProvider>`
- [ ] Create `/api/auth/upsert` — the server-side sync route
- [ ] Add a `User` table with `supabaseId`, `email`, `role`, `orgId` columns
- [ ] Gate redirects on `user.prismaId` (or equivalent) so DB sync is complete
- [ ] Create `/set-password` page for invite + reset flows
- [ ] Create `/auth/handoff` page if using subdomains
- [ ] Set redirect URLs in Supabase dashboard → Auth → URL Configuration
- [ ] Never show raw Supabase error strings to users — map them to friendly messages
- [ ] Never put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_` variable
