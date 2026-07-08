-- Seed the 4 quarter-final fixtures (round_id = qf) and open the QF re-draft
-- window. Pairings + kickoff times from the official bracket once the R16
-- concluded (2026-07-08). kickoff_time is UTC; first match Morocco v France =
-- 20:00 UTC = 01:30 IST, 2026-07-09. Home/away follows the published fixture
-- order ("X vs Y" = X home).
insert into matches (id, round_id, home_nation_id, away_nation_id, kickoff_time, status, venue_city)
values
  (97,  'a0000000-0000-0000-0000-000000000004', 28, 18, '2026-07-09 20:00:00+00', 'scheduled', 'Foxborough'),      -- Morocco v France
  (98,  'a0000000-0000-0000-0000-000000000004',  5, 41, '2026-07-10 19:00:00+00', 'scheduled', 'Inglewood'),       -- Belgium v Spain
  (99,  'a0000000-0000-0000-0000-000000000004', 31, 17, '2026-07-11 21:00:00+00', 'scheduled', 'Miami Gardens'),   -- Norway v England
  (100, 'a0000000-0000-0000-0000-000000000004',  2, 43, '2026-07-12 01:00:00+00', 'scheduled', 'Kansas City')      -- Argentina v Switzerland
on conflict (id) do nothing;

-- Open the QF re-draft window for every league. Closes 30 min before the first QF
-- kickoff (20:00 UTC) = 19:30 UTC = 01:00 IST, mirroring the R16 window lead.
-- The bracket window is not a row — it auto-locks 30 min before first kickoff.
insert into redraft_windows (league_id, round_id, status, opens_at, closes_at)
select id, 'a0000000-0000-0000-0000-000000000004', 'open', now(), '2026-07-09 19:30:00+00'
from leagues
on conflict do nothing;
