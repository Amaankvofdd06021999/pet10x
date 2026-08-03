-- "Walk" is a dog's word. A cat's equivalent activity is play, and both
-- species have outings that are not walks (the park, the carrier, the yard).
-- Logging a cat's afternoon as a "walk" was the only option before this.
--
-- Enum values are added in their own migration because a value cannot be
-- USED in the same transaction that adds it.
alter type care_entry_kind add value if not exists 'play';
alter type care_entry_kind add value if not exists 'outing';
