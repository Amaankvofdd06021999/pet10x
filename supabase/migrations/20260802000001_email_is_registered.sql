-- Authoritative "does this address already have an account?" check.
--
-- The signup endpoint must answer identically for registered and unregistered
-- addresses (otherwise it is an account-enumeration oracle), which means it
-- needs to know the truth in order to hide it — sending the "you already have
-- an account" email instead of a code, while returning the same response.
--
-- Reading public.profiles would be a proxy, not the truth: a profile row is
-- created by a trigger and could in principle be missing or deleted while the
-- auth.users row survives, and a signup allowed against a live auth account
-- would fail confusingly at creation time. This reads auth.users directly.
--
-- SECURITY DEFINER because auth.users is not readable by API roles, and
-- execute is granted to service_role only — this is never called from a
-- browser, so nothing can use it to probe for registered addresses.
create or replace function public.email_is_registered(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(trim(p_email))
  );
$$;

revoke all on function public.email_is_registered(text) from public, anon, authenticated;
grant execute on function public.email_is_registered(text) to service_role;
