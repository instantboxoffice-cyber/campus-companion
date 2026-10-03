-- Friend chat upgrade: voice notes, photos, documents, replies, delete for everyone.

-- 1) A message can now be an attachment with no text (WhatsApp style).
alter table public.direct_messages
  drop constraint if exists direct_messages_content_check;

alter table public.direct_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_type text check (attachment_type in ('image', 'audio', 'file')),
  add column if not exists attachment_name text,
  add column if not exists attachment_size integer,
  add column if not exists attachment_mime text,
  add column if not exists audio_seconds integer,
  add column if not exists reply_to_id uuid references public.direct_messages(id) on delete set null,
  add column if not exists reply_preview text;

-- Text can be empty only when there is an attachment.
alter table public.direct_messages
  drop constraint if exists dm_content_or_attachment;
alter table public.direct_messages
  add constraint dm_content_or_attachment check (
    (attachment_path is not null and char_length(content) <= 2000)
    or char_length(content) between 1 and 2000
  );

-- 2) Private storage for chat media (max 25 MB per file).
insert into storage.buckets (id, name, public, file_size_limit)
values ('dm-media', 'dm-media', false, 26214400)
on conflict (id) do nothing;

-- Upload only into your own folder (YOUR_ID/...).
drop policy if exists "DM media: upload own" on storage.objects;
create policy "DM media: upload own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dm-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Open a file if you sent it, or if it was sent to you in a message.
drop policy if exists "DM media: read yours" on storage.objects;
create policy "DM media: read yours"
on storage.objects for select to authenticated
using (
  bucket_id = 'dm-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.direct_messages m
      where m.attachment_path = storage.objects.name
        and m.recipient_id = auth.uid()
    )
  )
);

drop policy if exists "DM media: delete own" on storage.objects;
create policy "DM media: delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'dm-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 3) Delete for everyone: you can remove your own messages.
drop policy if exists "Delete your own messages" on public.direct_messages;
create policy "Delete your own messages"
on public.direct_messages for delete to authenticated
using (auth.uid() = sender_id);

-- 4) Chat list preview: say "Voice message" / "Photo" / file name instead of blank text.
drop function if exists public.get_conversations();
create or replace function public.get_conversations()
returns table (
  other_id uuid,
  last_content text,
  last_type text,
  last_at timestamptz,
  last_sender_id uuid,
  unread_count bigint
)
language sql stable as $$
  with mine as (
    select *, case when sender_id = auth.uid() then recipient_id else sender_id end as other
    from public.direct_messages
    where auth.uid() in (sender_id, recipient_id)
  ),
  last_msg as (
    select distinct on (other)
      other,
      case
        when content <> '' then content
        when attachment_type = 'file' then coalesce(attachment_name, 'Document')
        else ''
      end as content,
      attachment_type,
      created_at,
      sender_id
    from mine order by other, created_at desc
  ),
  unread as (
    select sender_id as other, count(*) as n
    from public.direct_messages
    where recipient_id = auth.uid() and read_at is null
    group by sender_id
  )
  select l.other, l.content, l.attachment_type, l.created_at, l.sender_id, coalesce(u.n, 0)
  from last_msg l left join unread u on u.other = l.other
  order by l.created_at desc
$$;
grant execute on function public.get_conversations() to authenticated;
