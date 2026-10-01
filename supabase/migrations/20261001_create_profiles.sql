create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  constraint username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$')
);

alter table public.profiles enable row level security;

create policy "Signed-in users can view profiles"
on public.profiles for select to authenticated using (true);

create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (auth.uid() = id) with check (auth.uid() = id);

-- Give every existing, verified user a profile
insert into public.profiles (id)
select id from auth.users where email_confirmed_at is not null
on conflict do nothing;

-- Create a profile automatically once a new user verifies their code
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_confirmed
after insert or update of email_confirmed_at on auth.users
for each row
when (new.email_confirmed_at is not null)
execute function public.handle_new_user();

-- The count itself: one number, no rows exposed
create or replace function public.get_user_count()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.profiles
$$;
grant execute on function public.get_user_count() to authenticated;

-- Make new signups broadcast live
alter publication supabase_realtime add table public.profiles;