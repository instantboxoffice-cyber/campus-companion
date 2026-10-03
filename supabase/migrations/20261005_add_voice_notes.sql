-- Voice notes: a chat message can now carry a saved audio recording.

-- 1) New columns on messages.
--    audio_path    = where the voice note is saved in Storage
--    audio_seconds = how long it is (shown on the bubble)
--    transcript    = the hidden written copy the AI reads (never shown in chat)
alter table public.messages
  add column if not exists audio_path text,
  add column if not exists audio_seconds integer,
  add column if not exists transcript text;

-- 2) Private Storage folder for voice notes (max 5 MB per file).
--    Private = only the owner can play their own voice notes.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-audio', 'chat-audio', false, 5242880)
on conflict (id) do nothing;

-- 3) Each person can only touch files inside their own folder (USER_ID/...).
drop policy if exists "Voice notes: upload own" on storage.objects;
create policy "Voice notes: upload own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Voice notes: read own" on storage.objects;
create policy "Voice notes: read own"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Voice notes: delete own" on storage.objects;
create policy "Voice notes: delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);
