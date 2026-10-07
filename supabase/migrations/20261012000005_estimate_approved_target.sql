-- Pet10x — Part F: an approved estimate opens the practice's Billing tab.
--
-- The clinic console now has an inbox (components/notifications/console-inbox)
-- and a console target grammar of its own (`clinic:<tab>`, CLINIC_TABS in
-- lib/navigation.ts). owner_approve_estimate's notification to the practice
-- carried no target, so it could be read but led nowhere. The body below is
-- 20261010000001's, verbatim, with action_label and action_target added to the
-- one insert; nothing else changes. Grants are untouched by create or replace.

create or replace function public.owner_approve_estimate(p_invoice uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare inv record;
begin
  select i.*, p.owner_id, p.name as pet_name into inv from public.invoices i
    join public.clinic_patients cp on cp.id = i.patient_id
    join public.pets p on p.id = cp.pet_id
   where i.id = p_invoice;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if inv.owner_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if inv.kind <> 'estimate' then return jsonb_build_object('ok', false, 'error', 'not_an_estimate'); end if;
  if inv.status <> 'sent' then return jsonb_build_object('ok', false, 'error', 'not_awaiting_approval'); end if;
  update public.invoices set status = 'approved', owner_approved_at = now() where id = p_invoice;

  -- Part E (20261010000001): the practice's administrators — the business
  -- owner (whose own staff row may say `veterinarian`) and active
  -- owner/manager staff. `union` de-duplicates the owner who has both.
  insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
  select r.profile_id, 'clinic', 'success',
         'Estimate approved for ' || inv.pet_name,
         'The owner approved the ' || coalesce('estimate ' || inv.number, 'estimate') || ' for '
           || inv.pet_name || ' ('
           || to_char(inv.total_cents / 100.0, 'FM999,999,990.00') || ' ' || upper(inv.currency) || ').',
         'Open billing',
         'clinic:billing'
    from (
      select b.owner_id as profile_id from public.businesses b where b.id = inv.business_id
      union
      select s.profile_id from public.business_staff s
       where s.business_id = inv.business_id and s.is_active and s.role in ('owner', 'manager')
    ) r
    join public.profiles pr on pr.id = r.profile_id
   where not pr.is_suspended and r.profile_id <> auth.uid();

  return jsonb_build_object('ok', true);
end; $$;
