-- Pet10x — AI vet assistant (resident side).
--
-- Threaded chat, per-message triage audit, and deterministic suggestion cards.
-- Conventions follow 20260601000000_init_schema.sql: uuid PKs, set_updated_at()
-- trigger, RLS declared in this same file.
--
-- Access model: everything here is owner-private. Building managers get no
-- read path to any of these tables — what an owner asks the assistant is not
-- governance data. Only the owner and super admins can see it.
--
-- NOTE ON SCOPE vs. the written plan: the plan proposed a `pet_feeding_log`
-- table on the assumption that pet_feeding was a schedule with no log. That is
-- stale — `care_entries` (kinds food/medicine/treat/water/walk/weight/potty)
-- already is the care log and is what the app writes to, so the adherence rules
-- read that instead and no new logging table is created here.

-- ---------------------------------------------------------------------------
-- Enum + column additions
-- ---------------------------------------------------------------------------

-- Suggestion cards surface through the existing Alerts screen, so notifications
-- needs a kind for them. `add value` cannot run in the same transaction as a
-- later use of the new label, hence `if not exists` and no usage below.
alter type notification_kind add value if not exists 'assistant';

-- Consent gate: the assistant refuses to answer until this is set.
alter table public.profiles
  add column if not exists ai_consent_at timestamptz;

-- pet_medications.next_due is free text ("Today", "Mar 1, 2026") and cannot be
-- compared to a date, which makes medication reminders impossible. This is the
-- machine-readable half; the text column stays for display and back-compat.
alter table public.pet_medications
  add column if not exists next_due_at date;

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
create table if not exists public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pet_id     uuid references public.pets(id) on delete set null,  -- null = general question
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists ai_conversations_profile_idx
  on public.ai_conversations (profile_id, updated_at desc)
  where deleted_at is null;

drop trigger if exists set_ai_conversations_updated_at on public.ai_conversations;
create trigger set_ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  image_paths     text[] not null default '{}',   -- pet-media storage paths
  citations       jsonb  not null default '[]',   -- [{title, url, source}]
  triage_level    text check (triage_level in ('emergency','urgent','routine')),
  model           text,
  tokens_in       int,
  tokens_out      int,
  created_at      timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Suggestions
-- ---------------------------------------------------------------------------
create table if not exists public.ai_suggestions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  pet_id       uuid not null references public.pets(id) on delete cascade,
  kind         text not null,   -- vaccination_due | medication_due | care_adherence | document_missing | checkup_due
  severity     text not null default 'info' check (severity in ('info','warning','error','success')),
  title        text not null,
  body         text,
  action_label text,
  action_target text,
  evidence     jsonb,           -- the rows that fired it, so the card can explain itself
  dedupe_key   text not null,
  status       text not null default 'active' check (status in ('active','dismissed','resolved')),
  valid_until  timestamptz,
  created_at   timestamptz not null default now(),
  unique (profile_id, dedupe_key)
);

create index if not exists ai_suggestions_active_idx
  on public.ai_suggestions (profile_id, created_at desc)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- RLS — owner-scoped, mirroring 20260601000001_functions_rls.sql
-- ---------------------------------------------------------------------------
alter table public.ai_conversations enable row level security;
alter table public.ai_messages      enable row level security;
alter table public.ai_suggestions   enable row level security;

drop policy if exists ai_conversations_rw on public.ai_conversations;
create policy ai_conversations_rw on public.ai_conversations for all
  using      (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- Messages inherit the conversation's owner. No manager path, by design.
drop policy if exists ai_messages_rw on public.ai_messages;
create policy ai_messages_rw on public.ai_messages for all
  using (
    exists (select 1 from public.ai_conversations c
            where c.id = ai_messages.conversation_id
              and (c.profile_id = auth.uid() or public.is_admin()))
  ) with check (
    exists (select 1 from public.ai_conversations c
            where c.id = ai_messages.conversation_id
              and (c.profile_id = auth.uid() or public.is_admin()))
  );

drop policy if exists ai_suggestions_rw on public.ai_suggestions;
create policy ai_suggestions_rw on public.ai_suggestions for all
  using      (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- The suggestion runner mirrors each new card into `notifications` so it shows
-- up in the existing Alerts screen. `notifications` had SELECT and UPDATE
-- policies but no INSERT one, so that write was silently denied.
--
-- Deliberately narrow: a signed-in user may create assistant notifications for
-- themselves and nothing else. Compliance, incident, building and billing
-- notifications stay server-authored, so this cannot be used to forge an
-- official-looking alert.
drop policy if exists notifs_insert_own_assistant on public.notifications;
create policy notifs_insert_own_assistant on public.notifications for insert
  with check (profile_id = auth.uid() and kind = 'assistant');
