-- A notification kind for care reminders.
--
-- Alone in its own migration on purpose: Postgres permits ALTER TYPE ... ADD
-- VALUE inside a transaction, but the new label cannot be *used* until that
-- transaction commits. Keeping it separate means the next migration — and
-- anything that inserts with kind='care' — is always running after the commit
-- that created the label.
alter type public.notification_kind add value if not exists 'care';
