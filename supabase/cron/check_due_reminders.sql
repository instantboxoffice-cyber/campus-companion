-- Enable required extensions if they are not already available.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Run the reminder checker every minute.
-- Replace PROJECT_REF below with your actual Supabase project reference.
select cron.schedule(
  'check_due_reminders_every_minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/check-due-reminders',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Optional: inspect scheduled jobs.
-- select * from cron.job;
