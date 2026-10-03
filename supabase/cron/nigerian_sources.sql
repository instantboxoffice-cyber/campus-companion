-- Switch the Reels pool to general Nigerian content (not only campus/students).

-- 1) Turn off every old source (campus/student ones).
update public.shorts_sources set active = false;

-- 2) Optional but recommended: clear the old pool so only Nigerian reels remain.
--    (Run step 3 and then trigger refresh-shorts with {"full": true} right after.)
delete from public.shorts_feed;

-- 3) Nigerian channels.
--    The first three handles were checked against published lists.
--    The rest are my best guesses: a wrong one switches itself off and is
--    reported in the "problems" part of the function's reply. Nothing breaks.
insert into public.shorts_sources (kind, value) values
  ('channel', '@markangelcomedy'),
  ('channel', '@SamSpedy'),
  ('channel', '@brightlightcomedy1987'),
  ('channel', '@AgbapsShorts'),
  ('channel', '@BrodaShaggi'),
  ('channel', '@LasisiElenu'),
  ('channel', '@ShankComics'),
  ('channel', '@channelstv'),
  ('channel', '@burnaboy'),
  ('channel', '@davido'),
  ('channel', '@wizkidofficial'),
  ('channel', '@remaofficial')
on conflict (kind, value) do update set active = true;

-- To add more later, copy any line above and change the @handle.
-- To remove one:  update public.shorts_sources set active = false where value = '@handle';
