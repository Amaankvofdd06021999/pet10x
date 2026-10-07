-- Pet10x — Part F: deleting an AI conversation deletes what was said in it.
--
-- DELETE /api/ai/conversations/[id] used to stamp `deleted_at` and leave every
-- message, and the title derived from the first one, in the database until
-- the whole account was deleted. The Privacy Policy said exactly that. A
-- person who deletes a conversation about their pet's rash means the words,
-- not the list entry.
--
-- From now on the route deletes the conversation's ai_messages rows and
-- clears its title, keeping only a content-free row (id, profile, pet,
-- timestamps, deleted_at) so admin_platform_stats can still count that a
-- conversation was started. Nothing rate-limits on messages, so no counter is
-- lost with them.
--
-- This migration does the same once for every conversation deleted before the
-- route changed. Their photos were already removed at delete time.

delete from public.ai_messages m
 using public.ai_conversations c
 where c.id = m.conversation_id
   and c.deleted_at is not null;

update public.ai_conversations
   set title = null
 where deleted_at is not null
   and title is not null;
