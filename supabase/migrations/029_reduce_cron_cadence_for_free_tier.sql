-- Reduce auto-score cron from every 2 min to every 5 min to stay within
-- Vercel Free Plan Fluid Active CPU limit (4h/month).
-- Current usage: ~4h 20m in last 30 days, climbing sharply during tournament.
-- Trade-off: max lag between FT and score finalization is ~5 min (was ~2 min).
-- This is acceptable since regulation matches finish ~105+ min after kickoff.
select cron.alter_job(2, schedule := '*/5 * * * *');
