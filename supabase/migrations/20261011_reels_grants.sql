-- Let signed-in users use the reels tables (fixes the 403 "Forbidden" errors).
-- Safe to run more than once. The row rules (RLS) from before still apply:
-- people can only add or remove their OWN likes and comments.

grant select, insert, delete on public.reel_likes to authenticated;
grant select, insert, delete on public.reel_comments to authenticated;
grant select on public.reel_views to authenticated;
