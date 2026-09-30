-- 1) Lets a chat message carry a picture.
alter table public.messages
  add column if not exists image_url text;

-- 2) Storage folder (bucket) where generated pictures are kept.
--    Public = anyone with the exact link can view the picture.
--    Links contain a long random ID, so they cannot be guessed.
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;