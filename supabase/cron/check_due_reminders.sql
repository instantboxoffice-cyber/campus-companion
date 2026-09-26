-- Enable required extensions if they are not already available.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Run the reminder checker every minute.
-- Replace PROJECT_REF below with your actual Supabase project reference.
-- Replace REPLACE_WITH_YOUR_CRON_SECRET below with the exact same value
-- you set as the CRON_SECRET Edge Function secret (see the setup steps).
-- This header is what proves to check-due-reminders that the call really
-- came from this cron job, and not from a stranger who found the URL.
--
-- Running this whole script again later (for example, to update the
-- secret or the URL) safely replaces the existing job of the same name -
-- it will not create a second, duplicate job.
select cron.schedule(
  'check_due_reminders_every_minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://rkvkmgipeholfltfwize.supabase.co/functions/v1/check-due-reminders',
    headers := '{"Content-Type":"application/json","x-cron-secret":"e4b7f9a2c1d8e56304b2a9f1c7d3e8b6f0a5c4d9e2b1f8a7c3d6e9b0f4a1c5d2"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Optional: inspect scheduled jobs.
-- select * from cron.job;