-- Message status: sent -> received (delivered) -> read.
-- "Unsent" is handled in the app (a message that failed to upload).

-- 1) When the other person's phone received the message.
alter table public.direct_messages
  add column if not exists delivered_at timestamptz;

-- Messages already read were obviously received too.
update public.direct_messages
set delivered_at = read_at
where read_at is not null and delivered_at is null;

-- 2) Only the recipient can set these two columns (and nothing else).
revoke update on public.direct_messages from authenticated;
grant update (read_at, delivered_at) on public.direct_messages to authenticated;

-- 3) Marks everything sent to you as received (uses the server clock).
create or replace function public.mark_dms_delivered()
returns void language sql as $$
  update public.direct_messages
  set delivered_at = now()
  where recipient_id = auth.uid() and delivered_at is null
$$;
grant execute on function public.mark_dms_delivered() to authenticated;

-- 4) Opening a chat marks messages read (and received, if not already).
create or replace function public.mark_dms_read(other_id uuid)
returns void language sql as $$
  update public.direct_messages
  set read_at = now(),
      delivered_at = coalesce(delivered_at, now())
  where recipient_id = auth.uid() and sender_id = other_id and read_at is null
$$;
grant execute on function public.mark_dms_read(uuid) to authenticated;

-- 5) The chat list can now show ticks on your last message.
drop function if exists public.get_conversations();
create or replace function public.get_conversations()
returns table (
  other_id uuid,
  last_content text,
  last_type text,
  last_at timestamptz,
  last_sender_id uuid,
  last_delivered_at timestamptz,
  last_read_at timestamptz,
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
      sender_id,
      delivered_at,
      read_at
    from mine order by other, created_at desc
  ),
  unread as (
    select sender_id as other, count(*) as n
    from public.direct_messages
    where recipient_id = auth.uid() and read_at is null
    group by sender_id
  )
  select l.other, l.content, l.attachment_type, l.created_at, l.sender_id,
         l.delivered_at, l.read_at, coalesce(u.n, 0)
  from last_msg l left join unread u on u.other = l.other
  order by l.created_at desc
$$;
grant execute on function public.get_conversations() to authenticated;
