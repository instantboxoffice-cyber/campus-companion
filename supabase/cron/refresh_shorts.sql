create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove the older jobs (if they exist), then refresh every 30 minutes.
select cron.unschedule('refresh_shorts_every_6h')
where exists (select 1 from cron.job where jobname = 'refresh_shorts_every_6h');
select cron.unschedule('refresh_shorts_every_3h')
where exists (select 1 from cron.job where jobname = 'refresh_shorts_every_3h');

select cron.schedule(
  'refresh_shorts_every_30m',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://rkvkmgipeholfltfwize.supabase.co/functions/v1/refresh-shorts',
    headers := '{"Content-Type":"application/json","x-cron-secret":"REPLACE_WITH_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
