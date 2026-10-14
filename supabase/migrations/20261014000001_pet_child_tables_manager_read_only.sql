-- Pet10x — a building's manager reads a pet's records and writes none of them.
--
-- 20260601000001 said it in a comment: "child tables: read = owner|manager|
-- admin ; write = owner|admin (managers read-only)". It wrote each table's rule
-- as ONE `for all` policy whose USING admits the manager and whose WITH CHECK
-- does not. WITH CHECK guards only the row a write PRODUCES, so:
--
--   INSERT   refused for a manager (WITH CHECK)            as intended
--   UPDATE   refused for a manager (WITH CHECK on new row)  as intended
--   DELETE   ALLOWED — a delete produces no row, so only USING is consulted
--
-- A manager could delete any resident's vaccination, document, medication,
-- vet visit, photo or care log in their building from the browser. Found while
-- running the Part B checks on 2026-10-14; the same shape is on every table
-- below, which are all the `for all` policies in `public` whose USING differs
-- from their WITH CHECK, and each is the table's only policy.
--
-- THE GRAMMAR, per table, replacing `<table>_rw`:
--   select   owner | manager of the pet's building | admin
--   insert   owner | admin
--   update   owner | admin   (USING and WITH CHECK both)
--   delete   owner | admin
--
-- Every client write to these tables is the owner's own (lib/data/live.ts,
-- lib/data/care-schedule.ts). Manager verdicts go through SECURITY DEFINER
-- functions (manager_review_pet_document, …), which RLS does not see. Deleting a
-- pet cascades through foreign keys, which RLS does not see either.
--
-- The replaced policy is checked before it is dropped: if a table's `_rw`
-- policy is not the exact owner|manager|admin / owner|admin pair this was
-- written against, the migration stops rather than replace something unseen.

do $$
declare
  t text;
  v_qual text;
  v_check text;
  v_read  constant text := '(EXISTS ( SELECT 1
   FROM pets p
  WHERE ((p.id = %1$I.pet_id) AND ((p.owner_id = auth.uid()) OR manages_building(p.building_id) OR is_admin()))))';
  v_write constant text := '(EXISTS ( SELECT 1
   FROM pets p
  WHERE ((p.id = %1$I.pet_id) AND ((p.owner_id = auth.uid()) OR is_admin()))))';
begin
  foreach t in array array[
    'care_entries', 'care_targets', 'pet_activity', 'pet_care_tasks',
    'pet_documents', 'pet_emergency_contacts', 'pet_feeding', 'pet_medications',
    'pet_photos', 'pet_vaccinations', 'pet_vet_visits'
  ] loop
    select qual, with_check into v_qual, v_check
      from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = t and policyname = t || '_rw' and cmd = 'ALL';

    if not found then
      raise exception 'policy public.%._rw not found; nothing was replaced', t;
    end if;
    if v_qual <> pg_catalog.format(v_read, t) or v_check <> pg_catalog.format(v_write, t) then
      raise exception 'policy public.%._rw is not the owner|manager|admin / owner|admin pair; nothing was replaced', t
        using detail = pg_catalog.format('USING %s WITH CHECK %s', v_qual, v_check);
    end if;

    execute pg_catalog.format('drop policy %I on public.%I', t || '_rw', t);

    execute pg_catalog.format($p$
      create policy %1$I on public.%2$I for select using (
        exists (select 1 from public.pets p where p.id = %2$I.pet_id
                and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin())))
    $p$, t || '_select', t);

    execute pg_catalog.format($p$
      create policy %1$I on public.%2$I for insert with check (
        exists (select 1 from public.pets p where p.id = %2$I.pet_id
                and (p.owner_id = auth.uid() or public.is_admin())))
    $p$, t || '_insert', t);

    execute pg_catalog.format($p$
      create policy %1$I on public.%2$I for update using (
        exists (select 1 from public.pets p where p.id = %2$I.pet_id
                and (p.owner_id = auth.uid() or public.is_admin())))
      with check (
        exists (select 1 from public.pets p where p.id = %2$I.pet_id
                and (p.owner_id = auth.uid() or public.is_admin())))
    $p$, t || '_update', t);

    execute pg_catalog.format($p$
      create policy %1$I on public.%2$I for delete using (
        exists (select 1 from public.pets p where p.id = %2$I.pet_id
                and (p.owner_id = auth.uid() or public.is_admin())))
    $p$, t || '_delete', t);
  end loop;
end $$;
