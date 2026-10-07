-- Part D review — retired SMS rules must stay editable.
--
-- 20261011000003 refused SMS with a NOT VALID check. A NOT VALID check is
-- still evaluated on every UPDATE of every row, so a rule saved as `sms`
-- before then could not be touched at all — not renamed, not even switched
-- off. The rule this enforces is narrower: nobody may CHOOSE sms. Inserting
-- an sms rule, or changing a rule's channel to sms, is refused; any other
-- write to a historic sms rule goes through, and so does moving it off sms.
--
-- A trigger, because a check cannot see OLD. The message starts with the old
-- constraint's name so `saveReminderRule`'s readable error still matches it.

alter table public.reminder_rules
  drop constraint if exists reminder_rules_channel_not_sms;

create or replace function public.reminder_rules_refuse_sms()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.channel = 'sms'
     and (tg_op = 'INSERT' or old.channel is distinct from 'sms') then
    raise exception 'reminder_rules_channel_not_sms: SMS reminders are not sent'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.reminder_rules_refuse_sms() from public, anon, authenticated;

drop trigger if exists trg_reminder_rules_refuse_sms on public.reminder_rules;
create trigger trg_reminder_rules_refuse_sms
  before insert or update of channel on public.reminder_rules
  for each row execute function public.reminder_rules_refuse_sms();
