-- OPTIONAL (Supabase): call FloodGuard's /api/tick every minute so offers expire, urgency
-- grows with waiting time and queued messages retry even when no dashboard is open.
-- Run once in the Supabase SQL editor after enabling the pg_cron and pg_net extensions
-- (Database → Extensions). Replace the URL and the secret (must equal CRON_SECRET).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'floodguard-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/tick',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- To remove: select cron.unschedule('floodguard-tick');
