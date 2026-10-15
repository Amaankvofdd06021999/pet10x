-- UI system — notifications can be snoozed or deleted with a swipe.
--
--   * notifications.snoozed_until — the row is asleep until then: out of the
--     inbox and the unread count, and not pushed or emailed. Snoozing clears
--     read_at, so the row comes back unread when it wakes.
--   * notifications.dismissed_at — "deleted" in the inbox. The row is hidden,
--     never erased: delivery bookkeeping (emailed_at, pushed_at, the claims)
--     stays intact, and Undo is restore_notification clearing the stamp.
--   * snooze_notification / dismiss_notification / restore_notification —
--     the only writers of the two columns. Security definer because
--     notifs_update would also let an admin (is_admin) touch other people's
--     rows through the API; these take the caller's OWN row and nobody
--     else's, admin or not. A row that is not the caller's (or does not
--     exist) is the same 'forbidden', so the answer says nothing about
--     whose ids are real.
--   * claim_notification_emails / claim_notification_pushes — copied from
--     their newest definitions (20261011000005 and 20261011000002) with one
--     filter added each: not dismissed, and not still asleep. A sleeping row
--     not yet sent is claimed when it wakes, not before.

alter table public.notifications
  add column if not exists snoozed_until timestamptz,
  add column if not exists dismissed_at  timestamptz;

create or replace function public.snooze_notification(p_id uuid, p_until timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := auth.uid();
  v_owner uuid;
begin
  select n.profile_id into v_owner from public.notifications n where n.id = p_id;
  -- NULL-safe: no session, no row, or someone else's row are all refused.
  if v_me is null or v_owner is null or v_owner <> v_me then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- The sheet only offers times inside this window; anything else is a
  -- client bug or a hand-made call, not a choice someone made.
  if p_until is null or p_until <= now() or p_until > now() + interval '7 days' then
    raise exception 'Pick a time within the next 7 days' using errcode = '22023';
  end if;
  update public.notifications
     set snoozed_until = p_until,
         read_at = null
   where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.dismiss_notification(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := auth.uid();
  v_owner uuid;
begin
  select n.profile_id into v_owner from public.notifications n where n.id = p_id;
  if v_me is null or v_owner is null or v_owner <> v_me then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- coalesce: a second delete keeps the first stamp.
  update public.notifications set dismissed_at = coalesce(dismissed_at, now()) where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.restore_notification(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := auth.uid();
  v_owner uuid;
begin
  select n.profile_id into v_owner from public.notifications n where n.id = p_id;
  if v_me is null or v_owner is null or v_owner <> v_me then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  update public.notifications set dismissed_at = null where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.snooze_notification(uuid, timestamptz) from public, anon;
revoke all on function public.dismiss_notification(uuid) from public, anon;
revoke all on function public.restore_notification(uuid) from public, anon;
grant execute on function public.snooze_notification(uuid, timestamptz) to authenticated;
grant execute on function public.dismiss_notification(uuid) to authenticated;
grant execute on function public.restore_notification(uuid) to authenticated;

-- claim_notification_emails: verbatim from 20261011000005, plus the two
-- lines marked 20261018000001.
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
       and n.email_failed_at is null  -- 20261011000005: refused for good
       and n.dismissed_at is null  -- 20261018000001: deleted in the inbox
       and (n.snoozed_until is null or n.snoozed_until <= now())  -- 20261018000001: still asleep
       and n.read_at is null
       and n.created_at > now() - interval '24 hours'
       and n.created_at <= now() - interval '2 minutes'
       and (n.email_claimed_at is null or n.email_claimed_at < now() - interval '15 minutes')
       and n.kind = any (p_kinds)
       /* A practice's reminder goes by email only when its rule says Email
          (20261011000003). `clinic_reminder_action('notify')` links the item
          to the notification it wrote; an in-app or call-list rule's
          reminder stays in the app (and push). */
       and not exists (select 1 from public.reminder_items ri
                        where ri.notification_id = n.id and ri.channel <> 'email')
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

-- claim_notification_pushes: verbatim from 20261011000002 (its only
-- definition), plus the two lines marked 20261018000001.
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
       and n.dismissed_at is null  -- 20261018000001: deleted in the inbox
       and (n.snoozed_until is null or n.snoozed_until <= now())  -- 20261018000001: still asleep
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
