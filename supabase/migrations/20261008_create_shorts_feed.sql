-- Where Shorts come from: a channel (by @handle or UC... id) or a search phrase.
-- No policies on purpose: only the server (service role) can read or change this.
create table if not exists public.shorts_sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('channel', 'search')),
  value text not null,
  channel_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, value)
);
alter table public.shorts_sources enable row level security;

-- The videos the app shows. Signed-in users can read; only the server writes.
create table if not exists public.shorts_feed (
  video_id text primary key,
  title text not null,
  channel_id text,
  channel_title text,
  thumbnail_url text,
  duration_seconds integer,
  published_at timestamptz,
  source_id uuid references public.shorts_sources(id) on delete set null,
  fetched_at timestamptz not null default now()
);
create index if not exists shorts_feed_published_idx
  on public.shorts_feed (published_at desc);

alter table public.shorts_feed enable row level security;
create policy "Signed-in users can read shorts"
  on public.shorts_feed for select to authenticated using (true);
