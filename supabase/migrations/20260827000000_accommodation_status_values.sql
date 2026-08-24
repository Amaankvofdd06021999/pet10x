-- Pet10x — Phase 7, Task 1a: the two accommodation_status values the ladder needs.
--
-- THIS FILE CONTAINS NOTHING ELSE, AND THAT IS NOT A STYLE CHOICE.
-- `alter type ... add value` cannot be followed by a *use* of that value in the
-- same transaction. `apply_migration` wraps each call in one transaction, and
-- `20260727172837_ai_assistant.sql` already broke a `db reset` in exactly this
-- way (recorded in Phase 0's findings). So the labels land alone, and every
-- later migration in this phase is free to reference them.
--
-- The ladder these two complete:
--
--   draft --submit--> pending <--resubmit-- info_requested
--                       |  \__needs more info__/
--             ______----+----______
--            v                     v
--        approved               denied           (terminal)
--
--   draft | pending | info_requested --withdraw--> withdrawn  (terminal)
--
-- `draft` exists because the `accommodation-docs` storage policies key on the
-- REQUEST ID (path segment 2), so a request row must exist before a document
-- can attach to it. The cost is a row a manager must never see, which
-- 20260827000002's rewrite of `accom_select` handles.
--
-- `withdrawn` exists so a resident can stop a request without a manager having
-- to deny it, and so retention has a clock (`withdrawn_at`) for that outcome.

alter type public.accommodation_status add value if not exists 'draft'     before 'pending';
alter type public.accommodation_status add value if not exists 'withdrawn' after  'info_requested';
