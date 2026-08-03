# Signup email verification

## The problem, measured

`components/screens/sign-in-screen.tsx` called `supabase.auth.signUp()` from
the browser. That creates an `auth.users` row immediately, and the
`on_auth_user_created` trigger creates a `public.profiles` row with it. On
2026-08-02, production held:

| | |
| --- | --- |
| Accounts | 41 |
| Confirmed within 5 seconds of creation | **32** |
| Never signed in | **26** |

Typing an address into the form was enough to register it. The address was
never proven to belong to the person typing it.

## The flow

Two server routes. The browser no longer calls `auth.signUp()` at all.

```
POST /api/auth/signup/start   { email, fullName? }
  → public.pending_signups row (code stored as a salted SHA-256 hash)
  → emails a 6-digit code, valid 15 minutes
  → creates NO account

POST /api/auth/signup/verify  { email, code, password, fullName? }
  → checks expiry, attempt count, then the hash
  → admin.createUser({ email_confirm: true })   ← the only account creation
  → deletes the pending row
  → browser signs in with the password it was holding
```

**The password is not sent in step 1.** It stays in React state in the browser
until the code is verified. There is no window in which Pet10x stores an
unverified person's password, hashed or otherwise — the pending table has no
column for one.

## Why an account can never be deleted after verification

This was the explicit risk to design against. Three independent reasons it
cannot happen:

1. **Ordering.** `verify` creates the account *first* and deletes the pending
   row *second*. A crash between the two leaves an orphaned pending row, which
   is harmless. The reverse order could consume a code and then fail to create
   anything.
2. **Scope.** `purge_expired_pending_signups()` issues one statement:
   `delete from public.pending_signups where expires_at < now()`. It has no
   reference to `auth.users` or `profiles`.
3. **Nothing to find.** A verified signup has no `pending_signups` row —
   it was deleted at verification — so a later sweep has no row that could
   even name that account.

Verified against production: an expired pending row was inserted for the same
email as a live account, the purge run, and the account and its profile were
still present afterwards.

## Abuse limits

| Control | Value | Why |
| --- | --- | --- |
| Code lifetime | 15 min | |
| Wrong attempts | 5, then the pending row is destroyed | A 6-digit code is only a gate if guessing is bounded |
| Resend cooldown | 60 s | |
| Total sends per signup | 5 | One address cannot be used to flood another's inbox |
| Code storage | SHA-256, peppered with a server secret and bound to the email | A leaked table cannot be brute-forced offline; a hash cannot be replayed to another address |
| Comparison | `timingSafeEqual` | |
| Code generation | `crypto.randomInt` | Uniform and unpredictable, unlike `Math.random()` |

`pending_signups` has RLS enabled with **no policies** and privileges revoked
from `anon`/`authenticated` — verified unreachable in both directions with the
public key (`42501` on read and write). Only the service role touches it.

## Account enumeration

`start` returns the identical body whether or not the address is registered.
When it is, no pending row is created and the address receives a "you already
have an account" email instead of a code. The endpoint cannot be used to test
which emails are on Pet10x; the person who owns the address is still told.

`verify` reports missing and expired pending signups identically, for the same
reason.

## Required manual step

The app no longer calls `auth.signUp()`, but **Supabase still accepts it**
directly from anyone holding the public anon key (which ships in the client
bundle by design). Probing production confirmed a direct
`POST /auth/v1/signup` still creates an unconfirmed `auth.users` row and a
`profiles` row.

To close it:

> Supabase Dashboard → **Authentication** → **Sign In / Providers** → **Email**
> → turn **off** "Allow new users to sign up".

`admin.createUser()` is unaffected by that setting, so the verified flow keeps
working. Confirm after flipping by running a signup end to end.

## Not done

- **Existing accounts are untouched.** 26 accounts have never signed in and
  predate this gate. Deleting user records is destructive and outward-facing,
  so it is a separate, explicit decision.
- **No SMS/second factor.** This proves control of an email address at signup;
  it is not MFA on sign-in.
