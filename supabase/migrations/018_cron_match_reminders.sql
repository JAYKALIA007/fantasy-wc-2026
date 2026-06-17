select cron.schedule(
  'match-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://fantasy-wc-2026-ashy.vercel.app/api/cron/match-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlod3NwcnRqa3B2dWpqeHNlZGN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTM3MjQzOCwiZXhwIjoyMDk2OTQ4NDM4fQ.uOT8vlGpD2s2Mk3ZUWoT2feNB1JBstgY3i5x_benDIU"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
