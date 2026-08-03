-- Email-OTP gate in front of account creation.
--
-- Before this, `supabase.auth.signUp()` ran from the browser and the project
-- has email confirmation disabled, so typing any address into the form created
-- a live, confirmed `auth.users` row — and the `on_auth_user_created` trigger
-- created a `profiles` row with it. 32 of 41 accounts were confirmed within
-- five seconds of creation and 26 had never signed in.
--
-- A signup now parks here until a 6-digit code sent to the address is entered.
-- Only then does the server create the real account.
--
-- NOTE ON WHAT IS *NOT* HERE: the password. It stays in the browser across the
-- code step and is posted once, at verification, to create the account. There
-- is no window in which Pet10x holds an unverified user's password at rest.

create table if not exists public.pending_signups (
  -- One pending signup per address; a resend updates this row rather than
  -- accumulating codes that would all remain valid.
  email        text        primary key,
  code_hash    text        not null,
  full_name    text,
  expires_at   timestamptz not null,
  -- Wrong guesses. A 6-digit code is 10^6 wide, so unlimited attempts is a
  -- brute force away from being no gate at all.
  attempts     smallint    not null default 0,
  -- Resends, so one address cannot be used to mail-bomb another.
  send_count   smallint    not null default 1,
  last_sent_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

comment on table public.pending_signups is
  'Unverified signup attempts. Never contains a password. Rows are deleted on successful verification or by expiry sweep; nothing here can affect auth.users.';

create index if not exists pending_signups_expires_at_idx
  on public.pending_signups (expires_at);

-- RLS on with NO policies: unreachable from anon/authenticated keys in either
-- direction. Only the service role (API routes) touches this table.
alter table public.pending_signups enable row level security;

revoke all on public.pending_signups from anon, authenticated;

/**
 * Delete pending signups whose code has expired.
 *
 * Scoped to this table by construction. It cannot touch auth.users or
 * profiles: a verified signup has already been promoted to a real account and
 * its pending row deleted in the same request, so there is nothing here for a
 * sweep to find. An account, once created, is never revisited by this code.
 */
create or replace function public.purge_expired_pending_signups()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.pending_signups where expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_expired_pending_signups() from public, anon, authenticated;
