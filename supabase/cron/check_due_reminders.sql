-- Enable required extensions if they are not already available.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Runs the reminder checker every minute.
--
-- BEFORE running this in the Supabase SQL Editor, replace:
--   PROJECT_REF     -> your Supabase project reference
--   REPLACE_WITH_CRON_SECRET -> the exact value saved in the CRON_SECRET
--                              Edge Function secret
--
-- NEVER save the real values in this file or commit them to Git.
--
-- Running this again later safely replaces the job with the same name.
-- It will not create a duplicate.
select cron.schedule(
  'check_due_reminders_every_minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/check-due-reminders',
    headers := '{"Content-Type":"application/json","x-cron-secret":"REPLACE_WITH_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Optional: see the scheduled jobs.
-- select * from cron.job;

-- Optional: see whether the function accepted the requests (200 = good, 401 = wrong secret).
-- select status_code, content, created from net._http_response order by created desc limit 5;