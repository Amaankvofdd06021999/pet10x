-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
alter table public.profiles
  add column if not exists ai_consent_at timestamptz;

alter table public.pet_medications
  add column if not exists next_due_at date;

create table if not exists public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pet_id     uuid references public.pets(id) on delete set null,
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

create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  image_paths     text[] not null default '{}',
  citations       jsonb  not null default '[]',
  triage_level    text check (triage_level in ('emergency','urgent','routine')),
  model           text,
  tokens_in       int,
  tokens_out      int,
  created_at      timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

create table if not exists public.ai_suggestions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  pet_id       uuid not null references public.pets(id) on delete cascade,
  kind         text not null,
  severity     text not null default 'info' check (severity in ('info','warning','error','success')),
  title        text not null,
  body         text,
  action_label text,
  action_target text,
  evidence     jsonb,
  dedupe_key   text not null,
  status       text not null default 'active' check (status in ('active','dismissed','resolved')),
  valid_until  timestamptz,
  created_at   timestamptz not null default now(),
  unique (profile_id, dedupe_key)
);

create index if not exists ai_suggestions_active_idx
  on public.ai_suggestions (profile_id, created_at desc)
  where status = 'active';

alter table public.ai_conversations enable row level security;
alter table public.ai_messages      enable row level security;
alter table public.ai_suggestions   enable row level security;

drop policy if exists ai_conversations_rw on public.ai_conversations;
create policy ai_conversations_rw on public.ai_conversations for all
  using      (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

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
