-- R16 ties are over; 8 teams advanced. Award the reach-QF progression bonus,
-- mirroring migrations 024 (reach-RO32) and 029 (reach-RO16). From R16 on there is
-- a SINGLE team (the RO32->RO16 collapse dissolved the secondary, spec §5-6), so
-- this is PRIMARY-ONLY, +20, no secondary rows.
--
-- Scored against each member's CARRIED R16 team via sticky carry-forward
-- (mirror of holdingForRound): the R16 re-draft holding if they redrafted at R16,
-- else the RO32 holding carried forward, else the onboarding pick.
-- "Reached QF" = that team advanced past R16 = nations.eliminated = false.
-- Idempotent via ON CONFLICT (league_member_id, milestone, nation_id).
--
-- ⚠️ OPERATIONAL NOTE: progression bonuses are awarded MANUALLY, one migration per
-- milestone (024 = reach-RO32, 029 = reach-RO16, this = reach-QF). Nothing fires
-- them at runtime. Remaining: reach-SF (+30), bronze (+35), reach-Final (+40),
-- win (+50) — all single-team / primary-only. See docs/knockout-reassignment-spec.md.
insert into progression_bonus_points
  (league_member_id, nation_id, milestone, pick_type, points)
select lm.id,
  coalesce(r16.primary_nation_id, r32.primary_nation_id, lm.primary_nation_id),
  'qf', 'primary', 20
from league_members lm
left join member_round_teams r16
  on r16.league_member_id = lm.id
  and r16.round_id = 'a0000000-0000-0000-0000-000000000002'
left join member_round_teams r32
  on r32.league_member_id = lm.id
  and r32.round_id = 'a0000000-0000-0000-0000-000000000003'
join nations n
  on n.id = coalesce(r16.primary_nation_id, r32.primary_nation_id, lm.primary_nation_id)
where n.eliminated = false
on conflict (league_member_id, milestone, nation_id) do nothing;
