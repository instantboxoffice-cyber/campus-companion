-- Enable required extensions if they are not already available.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Keep this idempotent when applying the setup more than once.
select cron.unschedule(jobid)
from cron.job
where jobname = 'check_due_reminders_every_minute';

-- Run the reminder checker every minute.
select cron.schedule(
  'check_due_reminders_every_minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://rkvkmgipeholfltfwize.supabase.co/functions/v1/check-due-reminders',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Optional: inspect scheduled jobs.
-- select * from cron.job;
