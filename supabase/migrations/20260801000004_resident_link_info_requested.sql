-- Record that a manager has asked a resident for missing details.
--
-- The obvious move was to add `info_requested` to resident_link_status, the
-- way accommodation_status and registration_status already have it. That is
-- wrong here: `status` is load-bearing. request_building_link and the
-- resident's own queries both filter `status in ('pending','approved')`, so
-- moving a link out of `pending` would make it vanish from the resident's own
-- screen and let them create a duplicate link by re-submitting their code.
--
-- The chase is not a state transition — the link is still pending, and still
-- awaiting the same decision. It is an annotation on top: who asked, and when.

alter table public.resident_links
  add column if not exists info_requested_at timestamptz,
  add column if not exists info_requested_by uuid references public.profiles(id) on delete set null;

comment on column public.resident_links.info_requested_at is
  'When a manager last asked this resident for missing registration details. Does not change status — the link is still pending the same decision.';

-- The manager queue sorts by "asked recently" to avoid chasing twice.
create index if not exists resident_links_info_requested_idx
  on public.resident_links (building_id, info_requested_at desc nulls last);
