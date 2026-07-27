-- Pet10x — retention for photos attached to assistant chats.
--
-- Chat attachments are a rash, a stool, a limp, a vet document. They are the
-- most sensitive thing the app holds and they have no reason to be kept once
-- the conversation has served its purpose, so they expire on a clock rather
-- than living in the bucket indefinitely.
--
-- Two helpers, both called only by the purge route with the service role:
-- one finds what has aged out, the other forgets the paths on the messages
-- that referenced them. The storage objects themselves are removed through the
-- Storage API — deleting rows from storage.objects would orphan the files.

-- ---------------------------------------------------------------------------
-- What has aged out
-- ---------------------------------------------------------------------------
create or replace function public.ai_expired_chat_media(p_days int default 7, p_limit int default 500)
returns table (path text)
language sql
security definer
set search_path = public, storage
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'pet-media'
    -- Only assistant attachments. Pet profile photos and documents live in the
    -- same bucket under the same prefix and must never be swept up by this.
    and o.name like '%/ai-%'
    and o.created_at < now() - make_interval(days => p_days)
  order by o.created_at
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Forget the paths we just deleted
-- ---------------------------------------------------------------------------
create or replace function public.ai_forget_chat_media(p_paths text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  touched int;
begin
  -- Subtract the purged paths rather than clearing the column, so a message
  -- with a mix of expired and still-live attachments keeps the live ones.
  update public.ai_messages m
     set image_paths = coalesce(
           array(select unnest(m.image_paths) except select unnest(p_paths)),
           '{}'
         )
   where m.image_paths && p_paths;
  get diagnostics touched = row_count;
  return touched;
end;
$$;

-- These bypass RLS by design, so no signed-in role may call them. The purge
-- route uses the service role, which is not subject to these grants.
revoke all on function public.ai_expired_chat_media(int, int) from public, anon, authenticated;
revoke all on function public.ai_forget_chat_media(text[])  from public, anon, authenticated;
