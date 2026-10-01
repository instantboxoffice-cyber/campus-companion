create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint no_self_friending check (requester_id <> addressee_id)
);

-- One row per pair, whichever direction the request went
create unique index if not exists friendships_pair_idx
on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

create policy "See your own friendships"
on public.friendships for select to authenticated
using (auth.uid() in (requester_id, addressee_id));

-- You can only send a request as yourself, and only once you have a username
create policy "Send friend requests"
on public.friendships for insert to authenticated
with check (
  auth.uid() = requester_id
  and status = 'pending'
  and exists (select 1 from public.profiles where id = auth.uid() and username is not null)
);

-- Only the person who received the request can accept it
create policy "Accept requests sent to you"
on public.friendships for update to authenticated
using (auth.uid() = addressee_id and status = 'pending')
with check (status = 'accepted');

-- ...and the only column anyone can change is status
revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

-- Either side can decline, cancel, or unfriend
create policy "Remove your own friendships"
on public.friendships for delete to authenticated
using (auth.uid() in (requester_id, addressee_id));

alter publication supabase_realtime add table public.friendships;