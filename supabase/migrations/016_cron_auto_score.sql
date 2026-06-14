-- Schedule auto-score edge function every 15 minutes via pg_cron + pg_net
select cron.schedule(
  'auto-score-matches',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ihwsprtjkpvujjxsedcz.supabase.co/functions/v1/auto-score-matches',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlod3NwcnRqa3B2dWpqeHNlZGN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTM3MjQzOCwiZXhwIjoyMDk2OTQ4NDM4fQ.uOT8vlGpD2s2Mk3ZUWoT2feNB1JBstgY3i5x_benDIU"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
