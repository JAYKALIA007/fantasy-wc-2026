-- RO32 ties are over; 16 teams advanced. Award the reach-RO16 progression bonus,
-- mirroring the reach-RO32 award in migration 024. Two differences from 024:
--   1. Scored against each member's RO32-HELD teams — the re-draft holding
--      (member_round_teams @ ro32) if they re-drafted, else the onboarding pick
--      carried into the RO32 — NOT the original onboarding picks. Per spec §6 the
--      reach-RO16 milestone is scored against the team held DURING the RO32.
--   2. Amounts: held primary reached R16 → +10 (1x); held secondary reached R16
--      → +20 (2x). The +20 is the "secondary farewell" — a secondary's final earn
--      before the RO32→RO16 collapse dissolves the secondary concept (spec §5-6).
-- "Reached R16" = the team advanced past the RO32 = nations.eliminated = false.
-- Idempotent via ON CONFLICT (league_member_id, milestone, nation_id).
--
-- ⚠️ OPERATIONAL NOTE: progression bonuses are awarded MANUALLY, one migration per
-- milestone (024 = reach-RO32, this = reach-RO16). Nothing fires them at runtime.
-- Repeat this pattern at each round boundary: reach-QF (+20), reach-SF (+30),
-- bronze (+35), reach-Final (+40), win (+50) — single team from R16 on, so
-- primary-only, no secondary. See docs/knockout-reassignment-spec.md.

-- ---------------------------------------------------------------------------
-- 1. reach-RO16 for the held PRIMARY (+10, 1x).
-- ---------------------------------------------------------------------------
insert into progression_bonus_points
  (league_member_id, nation_id, milestone, pick_type, points)
select lm.id, coalesce(mrt.primary_nation_id, lm.primary_nation_id), 'r16', 'primary', 10
from league_members lm
left join member_round_teams mrt
  on mrt.league_member_id = lm.id
  and mrt.round_id = 'a0000000-0000-0000-0000-000000000003'
join nations n on n.id = coalesce(mrt.primary_nation_id, lm.primary_nation_id)
where n.eliminated = false
on conflict (league_member_id, milestone, nation_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. reach-RO16 for the held SECONDARY (+20, 2x farewell).
-- ---------------------------------------------------------------------------
insert into progression_bonus_points
  (league_member_id, nation_id, milestone, pick_type, points)
select lm.id, coalesce(mrt.secondary_nation_id, lm.secondary_nation_id), 'r16', 'secondary', 20
from league_members lm
left join member_round_teams mrt
  on mrt.league_member_id = lm.id
  and mrt.round_id = 'a0000000-0000-0000-0000-000000000003'
join nations n on n.id = coalesce(mrt.secondary_nation_id, lm.secondary_nation_id)
where n.eliminated = false
on conflict (league_member_id, milestone, nation_id) do nothing;
