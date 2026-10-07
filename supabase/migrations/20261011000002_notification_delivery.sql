-- Part D §2–§4 — notifications leave the app: preferences, a dispatcher's
-- bookkeeping, and web push subscriptions.
--
-- Until now a notification was a row a person saw only by opening Pet10x.
-- `/api/notifications/dispatch` (every 5 minutes) now emails and pushes them.
-- This migration holds everything that route needs from the database.

-- ---------------------------------------------------------------------------
-- 1. Preferences — one switch per channel, on by default
-- ---------------------------------------------------------------------------
/* `profiles_update_self` already lets the account write its own row, and
   `guard_profile_privilege` (latest: 20260714000000) refuses only role,
   is_super_admin and is_suspended — so these two need no new policy and no
   change to the guard. */
alter table public.profiles
  add column if not exists notify_email boolean not null default true,
  add column if not exists notify_push  boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Delivery bookkeeping on each notification
-- ---------------------------------------------------------------------------
/* `emailed_at` / `pushed_at` are written on SUCCESS only. The `*_claimed_at`
   pair is the lease a dispatcher run takes before it sends: two overlapping
   runs (a slow one and the next tick) must not both mail the same row, and a
   run that dies after claiming must not lose the row forever. A claim older
   than the lease is fair game again, which is also the retry for a send that
   failed. */
alter table public.notifications
  add column if not exists emailed_at       timestamptz,
  add column if not exists pushed_at        timestamptz,
  add column if not exists email_claimed_at timestamptz,
  add column if not exists push_claimed_at  timestamptz;

create index if not exists notifications_email_pending_idx
  on public.notifications (created_at) where emailed_at is null;
create index if not exists notifications_push_pending_idx
  on public.notifications (created_at) where pushed_at is null;

-- ---------------------------------------------------------------------------
-- 3. Web push subscriptions — one row per browser, owned by its account
-- ---------------------------------------------------------------------------
/* `push_tokens` is Expo-shaped (one opaque token, for a native client that
   does not exist yet) and is left alone. A browser subscription is three
   values — the endpoint and the two keys the payload is encrypted to. */
create table if not exists public.web_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists web_push_subscriptions_profile_idx
  on public.web_push_subscriptions (profile_id);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists wps_select_own on public.web_push_subscriptions;
create policy wps_select_own on public.web_push_subscriptions
  for select using (profile_id = auth.uid());
drop policy if exists wps_insert_own on public.web_push_subscriptions;
create policy wps_insert_own on public.web_push_subscriptions
  for insert with check (profile_id = auth.uid());
drop policy if exists wps_update_own on public.web_push_subscriptions;
create policy wps_update_own on public.web_push_subscriptions
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists wps_delete_own on public.web_push_subscriptions;
create policy wps_delete_own on public.web_push_subscriptions
  for delete using (profile_id = auth.uid());

/* The four verbs RLS polices, to the role that needs them, and nothing to
   anon (20260824000004's grammar). */
revoke all on public.web_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.web_push_subscriptions to authenticated;

/* Registering is a definer RPC, not a client upsert, because of one case RLS
   cannot express: a browser that last belonged to SOMEONE ELSE. Signing out
   deletes the row, but a session can also simply expire, leaving the
   endpoint bound to the previous account — whose notifications would then
   keep arriving on this device. The endpoint identifies the browser, the
   browser now belongs to the caller, so the caller takes it over. That is a
   write to another account's row, hence SECURITY DEFINER. */
create or replace function public.register_web_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2048
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = ''
     or length(p_p256dh) > 256 or length(p_auth) > 256 then
    return jsonb_build_object('ok', false, 'error', 'invalid_subscription');
  end if;

  delete from public.web_push_subscriptions
   where endpoint = p_endpoint and profile_id <> v_me;

  insert into public.web_push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent, last_used_at)
  values (v_me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300), now())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, last_used_at = now();

  -- A browser that re-subscribes gets a new endpoint and the old one dies
  -- unannounced; keep the newest twenty per account so dead rows cannot pile up.
  delete from public.web_push_subscriptions
   where profile_id = v_me
     and id not in (select id from public.web_push_subscriptions
                     where profile_id = v_me
                     order by coalesce(last_used_at, created_at) desc limit 20);

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.register_web_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_web_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The dispatcher's claims
-- ---------------------------------------------------------------------------
/* Each claim is ONE statement: select the eligible rows `for update skip
   locked`, stamp the lease, return what was stamped. A second run that
   overlaps skips every row the first holds and finds the rest already
   leased, so nothing is sent twice — the read and the write cannot be split
   by another run, which a select-then-update from the route could not
   promise.

   Called only by the cron route with the service role; nobody else has any
   business leasing another account's notifications, so neither function is
   granted to `authenticated`. */

-- Email: unread, 2 minutes to 24 hours old (an in-app read in the first two
-- minutes suppresses it), recipient opted in, kind on the route's list, and
-- every pending row of at most p_max_recipients people, so one person's
-- digest is never split across runs.
create or replace function public.claim_notification_emails(
  p_kinds public.notification_kind[], p_max_recipients integer default 200)
returns table (
  id uuid, profile_id uuid, email text, full_name text,
  kind public.notification_kind, severity text, title text, body text,
  action_label text, action_target text, created_at timestamptz,
  read_at timestamptz, notify_email boolean)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select n.id, n.profile_id, n.created_at
      from public.notifications n
     where n.emailed_at is null
       and n.read_at is null
       and n.created_at > now() - interval '24 hours'
       and n.created_at <= now() - interval '2 minutes'
       and (n.email_claimed_at is null or n.email_claimed_at < now() - interval '15 minutes')
       and n.kind = any (p_kinds)
       and exists (select 1 from public.profiles p
                    where p.id = n.profile_id and p.notify_email and not p.is_suspended
                      -- An account with no address is never claimed, rather
                      -- than re-leased all day for an email it cannot get.
                      and coalesce((select u.email::text from auth.users u where u.id = p.id),
                                   p.email, '') <> '')
     for update of n skip locked
  ),
  recipients as (
    select c.profile_id
      from candidates c
     group by c.profile_id
     order by min(c.created_at)
     limit greatest(coalesce(p_max_recipients, 200), 1)
  ),
  claimed as (
    update public.notifications n
       set email_claimed_at = now()
      from candidates c
      join recipients r on r.profile_id = c.profile_id
     where n.id = c.id
    returning n.id, n.profile_id, n.kind, n.severity, n.title, n.body,
              n.action_label, n.action_target, n.created_at, n.read_at
  )
  select cl.id, cl.profile_id, coalesce(u.email::text, p.email), p.full_name,
         cl.kind, cl.severity, cl.title, cl.body, cl.action_label, cl.action_target,
         cl.created_at, cl.read_at, p.notify_email
    from claimed cl
    join public.profiles p on p.id = cl.profile_id
    left join auth.users u on u.id = cl.profile_id
   order by cl.profile_id, cl.created_at
$$;
revoke all on function public.claim_notification_emails(public.notification_kind[], integer) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(public.notification_kind[], integer) to service_role;

-- Push: every kind, unread, under 24 hours old, recipient opted in and with
-- at least one subscription. No two-minute wait — a push is the fast channel.
create or replace function public.claim_notification_pushes(p_limit integer default 500)
returns table (
  id uuid, profile_id uuid, kind public.notification_kind, severity text,
  title text, body text, action_target text, created_at timestamptz)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select n.id
      from public.notifications n
     where n.pushed_at is null
       and n.read_at is null
       and n.created_at > now() - interval '24 hours'
       and (n.push_claimed_at is null or n.push_claimed_at < now() - interval '15 minutes')
       and exists (select 1 from public.profiles p
                    where p.id = n.profile_id and p.notify_push and not p.is_suspended)
       and exists (select 1 from public.web_push_subscriptions s where s.profile_id = n.profile_id)
     order by n.created_at
     limit greatest(coalesce(p_limit, 500), 1)
     for update of n skip locked
  )
  update public.notifications n
     set push_claimed_at = now()
    from candidates c
   where n.id = c.id
  returning n.id, n.profile_id, n.kind, n.severity, n.title, n.body, n.action_target, n.created_at
$$;
revoke all on function public.claim_notification_pushes(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_pushes(integer) to service_role;
