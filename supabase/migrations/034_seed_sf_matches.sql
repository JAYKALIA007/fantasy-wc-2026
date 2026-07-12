-- Seed the 2 semi-final fixtures (round_id = sf) and open the SF re-draft window.
-- Pairings + kickoff times from the official bracket once the QF concluded
-- (2026-07-11). kickoff_time is UTC; first match France v Spain = 19:00 UTC =
-- 00:30 IST, 2026-07-15. Home/away follows the published fixture order. The
-- orientation-agnostic ESPN matcher handles any home/away disagreement with ESPN.
insert into matches (id, round_id, home_nation_id, away_nation_id, kickoff_time, status, venue_city)
values
  (101, 'a0000000-0000-0000-0000-000000000005', 18, 41, '2026-07-14 19:00:00+00', 'scheduled', 'Arlington'),   -- France v Spain
  (102, 'a0000000-0000-0000-0000-000000000005', 17,  2, '2026-07-15 19:00:00+00', 'scheduled', 'Atlanta')       -- England v Argentina
on conflict (id) do nothing;

-- Open the SF re-draft window for every league. Closes 30 min before the first SF
-- kickoff (19:00 UTC) = 18:30 UTC = 00:00 IST. −20 to swap (ladder). The bracket
-- window auto-locks 30 min before first kickoff (no row needed).
insert into redraft_windows (league_id, round_id, status, opens_at, closes_at)
select id, 'a0000000-0000-0000-0000-000000000005', 'open', now(), '2026-07-14 18:30:00+00'
from leagues
on conflict do nothing;
