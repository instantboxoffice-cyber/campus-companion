create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint dm_no_self check (sender_id <> recipient_id)
);

create index if not exists dm_pair_idx
on public.direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);
create index if not exists dm_unread_idx
on public.direct_messages (recipient_id) where read_at is null;

alter table public.direct_messages enable row level security;

create policy "Read your own messages"
on public.direct_messages for select to authenticated
using (auth.uid() in (sender_id, recipient_id));

-- You can only send as yourself, and only to an accepted friend
create policy "Send to friends"
on public.direct_messages for insert to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = sender_id and f.addressee_id = recipient_id)
        or (f.requester_id = recipient_id and f.addressee_id = sender_id))
  )
);

-- Only the recipient can mark a message read, and read_at is the only editable column
create policy "Recipient marks read"
on public.direct_messages for update to authenticated
using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
revoke update on public.direct_messages from authenticated;
grant update (read_at) on public.direct_messages to authenticated;

-- Marks everything from one friend as read, using the server's clock
create or replace function public.mark_dms_read(other_id uuid)
returns void language sql as $$
  update public.direct_messages
  set read_at = now()
  where recipient_id = auth.uid() and sender_id = other_id and read_at is null
$$;
grant execute on function public.mark_dms_read(uuid) to authenticated;

-- One row per conversation for the chat list: last message + unread count
create or replace function public.get_conversations()
returns table (other_id uuid, last_content text, last_at timestamptz, last_sender_id uuid, unread_count bigint)
language sql stable as $$
  with mine as (
    select *, case when sender_id = auth.uid() then recipient_id else sender_id end as other
    from public.direct_messages
    where auth.uid() in (sender_id, recipient_id)
  ),
  last_msg as (
    select distinct on (other) other, content, created_at, sender_id
    from mine order by other, created_at desc
  ),
  unread as (
    select sender_id as other, count(*) as n
    from public.direct_messages
    where recipient_id = auth.uid() and read_at is null
    group by sender_id
  )
  select l.other, l.content, l.created_at, l.sender_id, coalesce(u.n, 0)
  from last_msg l left join unread u on u.other = l.other
  order by l.created_at desc
$$;
grant execute on function public.get_conversations() to authenticated;

alter publication supabase_realtime add table public.direct_messages;