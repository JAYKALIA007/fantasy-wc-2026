-- QF over; 4 teams advanced. Award the reach-SF progression bonus, mirroring
-- 024/029/031. Single team from R16 on (collapse), so PRIMARY-ONLY, +30.
-- Scored against each member's CARRIED QF team via sticky carry-forward (mirror of
-- holdingForRound): the latest holding at or before the QF, else the onboarding
-- pick. "Reached SF" = that team advanced past the QF = nations.eliminated = false.
-- Idempotent via ON CONFLICT (league_member_id, milestone, nation_id).
--
-- ⚠️ Progression bonuses are awarded MANUALLY, one migration per milestone
-- (024 RO32, 029 R16, 031 QF, this SF). Remaining: bronze (+35), reach-Final (+40),
-- win (+50). See docs/knockout-reassignment-spec.md.
insert into progression_bonus_points
  (league_member_id, nation_id, milestone, pick_type, points)
select lm.id,
  coalesce(qf.primary_nation_id, r16.primary_nation_id, r32.primary_nation_id, lm.primary_nation_id),
  'sf', 'primary', 30
from league_members lm
left join member_round_teams qf
  on qf.league_member_id = lm.id and qf.round_id = 'a0000000-0000-0000-0000-000000000004'
left join member_round_teams r16
  on r16.league_member_id = lm.id and r16.round_id = 'a0000000-0000-0000-0000-000000000002'
left join member_round_teams r32
  on r32.league_member_id = lm.id and r32.round_id = 'a0000000-0000-0000-0000-000000000003'
join nations n
  on n.id = coalesce(qf.primary_nation_id, r16.primary_nation_id, r32.primary_nation_id, lm.primary_nation_id)
where n.eliminated = false
on conflict (league_member_id, milestone, nation_id) do nothing;
