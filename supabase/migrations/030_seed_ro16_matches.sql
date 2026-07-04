-- Seed the 8 Round-of-16 fixtures (round_id = r16). Pairings + kickoff times from
-- the official bracket once the RO32 concluded (2026-07-03). kickoff_time is UTC;
-- first match Canada v Morocco = 17:00 UTC = 22:30 IST, 2026-07-04.
-- Home/away follows the published fixture order ("X vs Y" = X home).
insert into matches (id, round_id, home_nation_id, away_nation_id, kickoff_time, status, venue_city)
values
  (89, 'a0000000-0000-0000-0000-000000000002',  8, 28, '2026-07-04 17:00:00+00', 'scheduled', 'Houston'),        -- Canada v Morocco
  (90, 'a0000000-0000-0000-0000-000000000002', 33, 18, '2026-07-04 21:00:00+00', 'scheduled', 'Philadelphia'),   -- Paraguay v France
  (91, 'a0000000-0000-0000-0000-000000000002',  7, 31, '2026-07-05 20:00:00+00', 'scheduled', 'New Jersey'),     -- Brazil v Norway
  (92, 'a0000000-0000-0000-0000-000000000002', 27, 17, '2026-07-06 00:00:00+00', 'scheduled', 'Mexico City'),    -- Mexico v England
  (93, 'a0000000-0000-0000-0000-000000000002', 34, 41, '2026-07-06 19:00:00+00', 'scheduled', 'Arlington'),      -- Portugal v Spain
  (94, 'a0000000-0000-0000-0000-000000000002', 46,  5, '2026-07-07 00:00:00+00', 'scheduled', 'Seattle'),        -- USA v Belgium
  (95, 'a0000000-0000-0000-0000-000000000002',  2, 16, '2026-07-07 16:00:00+00', 'scheduled', 'Atlanta'),        -- Argentina v Egypt
  (96, 'a0000000-0000-0000-0000-000000000002', 43, 10, '2026-07-07 20:00:00+00', 'scheduled', 'Vancouver')       -- Switzerland v Colombia
on conflict (id) do nothing;
