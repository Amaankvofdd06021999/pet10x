-- Pet10x — Veterinary platform, part 4a: notification kinds.
-- Enum values are added in their own migration because Postgres refuses to use
-- a new enum value in the transaction that created it. The AI-assistant phase
-- learned this the hard way when a combined migration broke `db reset`.
alter type public.notification_kind add value if not exists 'appointment';
alter type public.notification_kind add value if not exists 'reminder';
alter type public.notification_kind add value if not exists 'clinic';
