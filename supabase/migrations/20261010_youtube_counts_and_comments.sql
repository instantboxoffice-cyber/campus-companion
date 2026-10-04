-- Show YouTube's own likes and comments next to the Campus Companion ones.
-- Safe to run more than once.

alter table public.shorts_feed
  add column if not exists yt_like_count bigint not null default 0,
  add column if not exists yt_comment_count bigint not null default 0;

-- Saved copy of YouTube comments (filled by the youtube-comments function).
-- No policies on purpose: only the server can read or write it.
create table if not exists public.yt_comments_cache (
  video_id text primary key,
  comments jsonb not null default '[]'::jsonb,
  disabled boolean not null default false,
  fetched_at timestamptz not null default now()
);
alter table public.yt_comments_cache enable row level security;

-- Same feed function as before, but the like and comment numbers now
-- include YouTube's numbers plus the ones from Campus Companion users.
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
    f.yt_like_count + (select count(*) from public.reel_likes l where l.video_id = f.video_id) as like_count,
    f.yt_comment_count + (select count(*) from public.reel_comments c where c.video_id = f.video_id) as comment_count,
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
