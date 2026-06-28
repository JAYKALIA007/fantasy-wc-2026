-- Group stage is over. Two things, both idempotent:
--   1. Mark the 16 teams eliminated at the group stage (32 advanced to RO32).
--      Survivor set is everything still eliminated = false.
--   2. Award the reach-RO32 progression bonus against each member's ORIGINAL
--      onboarding picks (league_members.primary/secondary_nation_id):
--        primary survived group  → +3 (1x)
--        secondary survived group → +6 (2x)
--      Scored once here, before the RO32 re-draft. See
--      docs/knockout-reassignment-spec.md §6.

-- ---------------------------------------------------------------------------
-- 1. Eliminations. The 16 teams NOT in the official RO32 bracket
--    (fifa.com group-stage permutations, 2026-06-28).
-- ---------------------------------------------------------------------------
update nations
  set eliminated = true,
      eliminated_in_round = 'group_stage'
where name in (
  'Curaçao', 'Czechia', 'Haiti', 'Iran', 'Iraq', 'Jordan',
  'New Zealand', 'Panama', 'Qatar', 'Saudi Arabia', 'Scotland',
  'South Korea', 'Tunisia', 'Türkiye', 'Uruguay', 'Uzbekistan'
);

-- ---------------------------------------------------------------------------
-- 2a. reach-RO32 for surviving PRIMARY picks (+3, 1x).
-- ---------------------------------------------------------------------------
insert into progression_bonus_points
  (league_member_id, nation_id, milestone, pick_type, points)
select lm.id, lm.primary_nation_id, 'ro32', 'primary', 3
from league_members lm
join nations n on n.id = lm.primary_nation_id
where n.eliminated = false
on conflict (league_member_id, milestone, nation_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2b. reach-RO32 for surviving SECONDARY picks (+6, 2x).
-- ---------------------------------------------------------------------------
insert into progression_bonus_points
  (league_member_id, nation_id, milestone, pick_type, points)
select lm.id, lm.secondary_nation_id, 'ro32', 'secondary', 6
from league_members lm
join nations n on n.id = lm.secondary_nation_id
where n.eliminated = false
on conflict (league_member_id, milestone, nation_id) do nothing;
