-- Part D §5 — a reminder rule can no longer promise SMS.
--
-- `reminder_rules.channel` offered Email and SMS and nothing sent either. SMS
-- is out of scope (decided 2026-10-07), so the console stops offering it, and
-- this stops a new or edited rule from choosing it. Email is now real: the
-- queue's Notify action writes a `reminder` notification to the owner, and
-- `/api/notifications/dispatch` emails it.
--
-- SUPERSEDED by 20261011000004, which replaces this check with a trigger so a
-- historic sms rule can still be edited.
--
-- NOT VALID on purpose: a rule saved as `sms` before today stays a valid row
-- (the original check still admits it, and it is shown as "SMS (retired)"),
-- but no insert and no update can produce one again. A historic `sms` rule
-- that is edited must therefore move to another channel in the same write —
-- the console's channel picker has no SMS option, so that is what it sends.
alter table public.reminder_rules
  drop constraint if exists reminder_rules_channel_not_sms;
alter table public.reminder_rules
  add constraint reminder_rules_channel_not_sms check (channel <> 'sms') not valid;
