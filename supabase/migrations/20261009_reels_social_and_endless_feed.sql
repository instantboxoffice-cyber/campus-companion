-- Reels upgrade: likes, comments, views, and a different endless feed per person.
-- Safe to run more than once.

-- 1) Store YouTube's own view number on each video (refresh-shorts fills it in).
alter table public.shorts_feed add column if not exists view_count bigint not null default 0;

-- 2) Which reels each person has already watched (private to that person).
create table if not exists public.reel_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, video_id)
);
alter table public.reel_views enable row level security;
drop policy if exists "Users read their own views" on public.reel_views;
create policy "Users read their own views"
  on public.reel_views for select to authenticated using (auth.uid() = user_id);

-- 3) Likes (heart). Everyone signed in can see them, you can only change your own.
create table if not exists public.reel_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index if not exists reel_likes_video_idx on public.reel_likes (video_id);
alter table public.reel_likes enable row level security;
drop policy if exists "Signed-in users read likes" on public.reel_likes;
create policy "Signed-in users read likes"
  on public.reel_likes for select to authenticated using (true);
drop policy if exists "Users add their own like" on public.reel_likes;
create policy "Users add their own like"
  on public.reel_likes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users remove their own like" on public.reel_likes;
create policy "Users remove their own like"
  on public.reel_likes for delete to authenticated using (auth.uid() = user_id);

-- 4) Comments. user_id points at profiles so the app can show the username and photo.
create table if not exists public.reel_comments (
  id uuid primary key default gen_random_uuid(),
  video_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists reel_comments_video_idx on public.reel_comments (video_id, created_at desc);
alter table public.reel_comments enable row level security;
drop policy if exists "Signed-in users read comments" on public.reel_comments;
create policy "Signed-in users read comments"
  on public.reel_comments for select to authenticated using (true);
drop policy if exists "Users add their own comment" on public.reel_comments;
create policy "Users add their own comment"
  on public.reel_comments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users delete their own comment" on public.reel_comments;
create policy "Users delete their own comment"
  on public.reel_comments for delete to authenticated using (auth.uid() = user_id);

-- 5) The feed. Each person gets a fresh random batch every time:
--    reels they have never watched come first (shuffled), then the ones they
--    watched longest ago. p_exclude lets the app skip reels already on screen.
create or replace function public.get_reels(
  p_limit int default 12,
  p_exclude text[] default '{}'
)
returns table (
  video_id text,
  title text,
  channel_title text,
  thumbnail_url text,
  views bigint,
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.video_id,
    f.title,
    f.channel_title,
    f.thumbnail_url,
    f.view_count + (select count(*) from public.reel_views v where v.video_id = f.video_id) as views,
    (select count(*) from public.reel_likes l where l.video_id = f.video_id) as like_count,
    (select count(*) from public.reel_comments c where c.video_id = f.video_id) as comment_count,
    exists (
      select 1 from public.reel_likes l
      where l.video_id = f.video_id and l.user_id = auth.uid()
    ) as liked_by_me
  from public.shorts_feed f
  left join public.reel_views me
    on me.video_id = f.video_id and me.user_id = auth.uid()
  where not (f.video_id = any (coalesce(p_exclude, '{}')))
  order by me.last_seen asc nulls first, random()
  limit least(greatest(p_limit, 1), 30)
$$;
grant execute on function public.get_reels(int, text[]) to authenticated;

-- 6) Remember that this person watched a reel.
create or replace function public.mark_reel_seen(p_video_id text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.reel_views (user_id, video_id)
  values (auth.uid(), p_video_id)
  on conflict (user_id, video_id) do update set last_seen = now()
$$;
grant execute on function public.mark_reel_seen(text) to authenticated;
