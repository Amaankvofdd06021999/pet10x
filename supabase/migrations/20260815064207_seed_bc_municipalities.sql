-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- Postal coverage for the municipalities Pet10x's buildings are in.
--
-- Names and FSA prefixes only. Phone and URL are deliberately left NULL: a
-- wrong animal-control number on a dog-attack screen is worse than none, and
-- these are not values I can verify. The UI falls back to "call your local
-- animal control, or 911 if anyone is in danger" until an admin fills them in.
insert into public.municipalities (name, region, postal_prefixes) values
  ('Vancouver', 'BC', array['V5K','V5L','V5M','V5N','V5P','V5R','V5S','V5T','V5V','V5W','V5X','V5Y','V5Z','V6A','V6B','V6C','V6E','V6G','V6H','V6J','V6K','V6L','V6M','V6N','V6P','V6R','V6S','V6T','V6Z']),
  ('Burnaby',   'BC', array['V3J','V3N','V5A','V5B','V5C','V5E','V5G','V5H','V5J']),
  ('Richmond',  'BC', array['V6V','V6W','V6X','V6Y','V7A','V7B','V7C','V7E']),
  ('Surrey',    'BC', array['V3R','V3S','V3T','V3V','V3W','V3X','V3Z','V4A','V4N','V4P']),
  ('Victoria',  'BC', array['V8N','V8P','V8R','V8S','V8T','V8V','V8W','V8X','V8Y','V8Z','V9A','V9B','V9C','V9E']),
  ('Kelowna',   'BC', array['V1V','V1W','V1X','V1Y','V1Z'])
on conflict do nothing;

select name, array_length(postal_prefixes, 1) as prefixes from public.municipalities order by name;
