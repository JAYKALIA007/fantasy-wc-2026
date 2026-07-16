-- Open the Final-phase re-draft window (round = final). Single team, −25 to swap
-- (ladder). The survivor pool the page offers is nations.eliminated = false =
-- the two finalists (Spain, Argentina); the two Bronze teams (France, England)
-- were tagged eliminated at the SF, so a Bronze-team holder can pay −25 to jump
-- to a finalist and chase Win +50 / Runner-up +40, or hold and play for Bronze
-- +35. Closes 30 min before the FIRST final-phase kickoff (Bronze, 18 Jul 21:00
-- UTC) = 20:30 UTC, so every holding locks before any final-phase match starts.
insert into redraft_windows (league_id, round_id, status, opens_at, closes_at)
select id, 'a0000000-0000-0000-0000-000000000006', 'open', now(), '2026-07-18 20:30:00+00'
from leagues
on conflict do nothing;
