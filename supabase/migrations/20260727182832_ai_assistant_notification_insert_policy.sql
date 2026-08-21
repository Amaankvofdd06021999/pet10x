-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
drop policy if exists notifs_insert_own_assistant on public.notifications;
create policy notifs_insert_own_assistant on public.notifications for insert
  with check (profile_id = auth.uid() and kind = 'assistant');
