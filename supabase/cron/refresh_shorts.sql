create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Refreshes the Shorts feed every 6 hours.
select cron.schedule(
  'refresh_shorts_every_6h',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/refresh-shorts',
    headers := '{"Content-Type":"application/json","x-cron-secret":"REPLACE_WITH_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
