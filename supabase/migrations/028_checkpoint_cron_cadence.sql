-- Bump the auto-score cron from every 5 min to every 2 min during the knockouts,
-- so live checkpoint windows can't linger more than ~2 min into the next phase.
-- Applied manually via the linked project (the same auto-score-matches job, id 2,
-- now also drives the live checkpoint pass added in the edge function).
select cron.alter_job(2, schedule := '*/2 * * * *');
