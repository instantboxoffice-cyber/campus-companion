-- 1) Safety net: lets the app create a user's own profile row if one is ever missing
create policy "Users can insert their own profile"
on public.profiles for insert to authenticated
with check (auth.uid() = id);

-- 2) Existing users were all backfilled at the same instant. Give each profile
--    the date the person actually signed up, so "newest first" means something.
update public.profiles p
set created_at = u.created_at
from auth.users u
where u.id = p.id;

-- 3) The people list: everyone with a username that you have no friendship or
--    pending request with, newest members first, 20 at a time.
create or replace function public.get_people_to_add(
  page_size int default 20,
  before_created_at timestamptz default null,
  before_id uuid default null
)
returns table (id uuid, username text, avatar_url text, created_at timestamptz)
language sql stable as $$
  select p.id, p.username, p.avatar_url, p.created_at
  from public.profiles p
  where p.id <> auth.uid()
    and p.username is not null
    and (before_created_at is null or (p.created_at, p.id) < (before_created_at, before_id))
    and not exists (
      select 1 from public.friendships f
      where (f.requester_id = auth.uid() and f.addressee_id = p.id)
         or (f.requester_id = p.id and f.addressee_id = auth.uid())
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(page_size, 1), 50)
$$;
grant execute on function public.get_people_to_add(int, timestamptz, uuid) to authenticated;