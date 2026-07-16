-- Seed the Bronze (3rd-place) and Final fixtures. Kickoffs + venues from the ESPN
-- fifa.world date-scoreboard (events 760516 / 760517); the team-schedule endpoint
-- lagged and didn't list them yet. kickoff_time is UTC. Home/away follows OUR
-- convention (SF winners at home: Spain, France); ESPN's orientation differs and
-- the orientation-agnostic matcher reconciles it. Bronze first (18 Jul) then Final
-- (19 Jul), so ids are chronological like the earlier rounds.
insert into matches (id, round_id, home_nation_id, away_nation_id, kickoff_time, status, venue_city)
values
  (103, 'a0000000-0000-0000-0000-000000000008', 18, 17, '2026-07-18 21:00:00+00', 'scheduled', 'Miami'),          -- Bronze: France v England
  (104, 'a0000000-0000-0000-0000-000000000006', 41,  2, '2026-07-19 19:00:00+00', 'scheduled', 'East Rutherford') -- Final: Spain v Argentina
on conflict (id) do nothing;
