-- Pet10x — a practice owner may administer the practice they own.
--
-- A solo practice is one person who is BOTH the owner and the vet. Their
-- explicit staff row says `veterinarian` (so they can read shared records), and
-- `staff_role_in` prefers the explicit row over ownership — which left them
-- unable to administer their own practice: the Team screen was filtered out of
-- the console, the record access log was unreadable, and billing was hidden.
--
-- Ownership and clinical role are separate axes. `staff_role_in` keeps
-- answering the clinical question; administration now follows ownership too.
create or replace function public.can_admin_business(p_business uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.staff_role_in(p_business) in ('owner','manager')
      or exists (
        select 1 from public.businesses b
        join public.profiles pr on pr.id = b.owner_id
        where b.id = p_business and b.owner_id = auth.uid() and not pr.is_suspended
      );
$$;
