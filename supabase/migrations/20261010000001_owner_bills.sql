-- Pet10x — Part E: an owner sees the estimates and invoices a practice sends,
-- and approves an estimate.
--
-- 1. THE LEAK. `invoices_owner_read` and `invoice_lines_owner_read`
--    (20260901000006) admitted every invoice on a chart linked to the owner's
--    pet, whatever its status — so a draft the practice was still pricing was
--    readable from the browser before anyone pressed Send. Both now require
--    `status <> 'draft'`. Staff are unaffected (`invoices_staff` /
--    `invoice_lines_staff`).
--
-- 2. clinic_set_invoice_status — copied from 20260901000006 unchanged except
--    for one addition: on draft -> sent it notifies the pet's owner (kind
--    `clinic`), with action target `my-vets:bills`. The notification is
--    written here, as the definer, because it is addressed to someone other
--    than the caller. A chart with no linked pet notifies nobody.
--
-- 3. owner_approve_estimate — copied from 20260901000006 with two changes: it
--    refuses anything whose kind is not `estimate` (`not_an_estimate`; an
--    owner "approving" an invoice moved it to approved, which the practice
--    reads as agreed money), and after approving it notifies the practice's
--    administrators — the business owner and every active owner/manager staff
--    row, unsuspended — with kind `clinic` and no action target: staff work
--    in /clinic, and no /app screen answers for them.
--
-- Payment is out of scope: `paid` stays a status the practice records.

-- ---------------------------------------------------------------------------
-- 1. Owners never read a draft
-- ---------------------------------------------------------------------------
drop policy if exists invoices_owner_read on public.invoices;
create policy invoices_owner_read on public.invoices for select
  using (status <> 'draft'
         and exists (select 1 from public.clinic_patients cp join public.pets p on p.id = cp.pet_id
                      where cp.id = invoices.patient_id and p.owner_id = auth.uid()));
drop policy if exists invoice_lines_owner_read on public.invoice_lines;
create policy invoice_lines_owner_read on public.invoice_lines for select
  using (exists (select 1 from public.invoices i join public.clinic_patients cp on cp.id = i.patient_id
                 join public.pets p on p.id = cp.pet_id
                 where i.id = invoice_lines.invoice_id and i.status <> 'draft'
                   and p.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Sending a bill tells the owner
-- ---------------------------------------------------------------------------
create or replace function public.clinic_set_invoice_status(
  p_invoice uuid, p_status text, p_paid_cents integer default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare inv record; ok boolean;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.staff_of_business(inv.business_id) and not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  ok := case inv.status
    when 'draft'    then p_status in ('sent','void')
    when 'sent'     then p_status in ('approved','paid','void','draft')
    when 'approved' then p_status in ('paid','void')
    when 'paid'     then p_status in ('void')
    else false end;
  if not ok then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', inv.status, 'to', p_status);
  end if;
  update public.invoices set
    status = p_status,
    issued_on = case when p_status = 'sent' and issued_on is null then current_date else issued_on end,
    paid_cents = case when p_status = 'paid' then coalesce(p_paid_cents, total_cents) else paid_cents end
  where id = p_invoice;

  -- Part E (20261010000001): the owner learns a bill has reached them. Only
  -- on draft -> sent — the move that makes it readable to them at all.
  if inv.status = 'draft' and p_status = 'sent' then
    insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
    select p.owner_id, 'clinic', 'info',
           case when inv.kind = 'estimate' then 'Estimate from ' else 'Invoice from ' end
             || coalesce(b.name, 'your vet'),
           coalesce(b.name, 'Your vet') || ' sent '
             || case when inv.kind = 'estimate' then 'an estimate' else 'an invoice' end
             || ' for ' || p.name || ': '
             || to_char(inv.total_cents / 100.0, 'FM999,999,990.00') || ' ' || upper(inv.currency) || '. '
             || case when inv.kind = 'estimate'
                     then 'Review and approve it before treatment starts.'
                     else 'Pay the clinic directly.' end,
           case when inv.kind = 'estimate' then 'Review estimate' else 'View invoice' end,
           'my-vets:bills'
      from public.clinic_patients cp
      join public.pets p on p.id = cp.pet_id
      left join public.businesses b on b.id = inv.business_id
     where cp.id = inv.patient_id;
  end if;

  return jsonb_build_object('ok', true, 'status', p_status);
end; $$;
revoke all on function public.clinic_set_invoice_status(uuid, text, integer) from public, anon;
grant execute on function public.clinic_set_invoice_status(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Approving: estimates only, and the practice hears about it
-- ---------------------------------------------------------------------------
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
  insert into public.notifications (profile_id, kind, severity, title, body)
  select r.profile_id, 'clinic', 'success',
         'Estimate approved for ' || inv.pet_name,
         'The owner approved the ' || coalesce('estimate ' || inv.number, 'estimate') || ' for '
           || inv.pet_name || ' ('
           || to_char(inv.total_cents / 100.0, 'FM999,999,990.00') || ' ' || upper(inv.currency) || ').'
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
revoke all on function public.owner_approve_estimate(uuid) from public, anon;
grant execute on function public.owner_approve_estimate(uuid) to authenticated;
