-- Part D review — an email Resend refuses for good stops being retried.
--
-- A send that failed kept its lease, and the lease expiring was the retry:
-- right for a 5xx or a network blip, wrong for a recipient Resend rejects as
-- invalid, which was re-sent every fifteen minutes for a day (~96 tries) and
-- failed every time. The dispatcher now stamps `email_failed_at` when Resend
-- says the message itself is the problem (`isPermanentEmailFailure` in
-- lib/email.ts: 422, or 400 validation); everything else still retries.
--
-- `emailed_at` stays "it was sent", so it is not reused for "it never will be".
--
-- claim_notification_emails is copied verbatim from 20261011000002 (the only
-- definition) with one line added: `email_failed_at is null`.

alter table public.notifications
  add column if not exists email_failed_at timestamptz;

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
