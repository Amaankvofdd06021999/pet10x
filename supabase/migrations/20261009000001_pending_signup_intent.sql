-- Pet10x — Part C: business sign-up verifies the email.
--
-- /api/business/signup created a confirmed auth user straight from the form —
-- no code, no cooldown, no send cap — which is exactly the hole the resident
-- OTP gate (20260802000000) closed for everyone else. Business sign-up now
-- parks in pending_signups too, and the same verify route creates the account.
--
-- `intent` says which account the verified code creates. `business` carries
-- what the business needs at creation ({businessName, category}) and is set
-- exactly when intent = 'business', so a business row can never verify into a
-- resident account with its details silently dropped, nor a resident row into
-- a business with none.
--
-- RLS and grants are untouched: the table stays service-role only.

alter table public.pending_signups
  add column if not exists intent text not null default 'resident',
  add column if not exists business jsonb null;

alter table public.pending_signups drop constraint if exists pending_signups_intent_ck;
alter table public.pending_signups add constraint pending_signups_intent_ck
  check (intent in ('resident', 'business'));

alter table public.pending_signups drop constraint if exists pending_signups_business_ck;
alter table public.pending_signups add constraint pending_signups_business_ck
  check ((intent = 'business') = (business is not null));

comment on column public.pending_signups.intent is
  'Which account the verified code creates: resident (default) or business (20261009000001).';
comment on column public.pending_signups.business is
  'For intent = business only: {"businessName": text, "category": text}. Null otherwise (pending_signups_business_ck).';
