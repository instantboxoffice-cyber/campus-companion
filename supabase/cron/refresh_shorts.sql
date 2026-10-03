create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove the old 6-hour job (if it exists), then refresh every 3 hours.
select cron.unschedule('refresh_shorts_every_6h')
where exists (select 1 from cron.job where jobname = 'refresh_shorts_every_6h');

select cron.schedule(
  'refresh_shorts_every_3h',
  '0 */3 * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/refresh-shorts',
    headers := '{"Content-Type":"application/json","x-cron-secret":"REPLACE_WITH_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
