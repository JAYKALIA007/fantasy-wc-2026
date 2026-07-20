-- Final over: Spain beat Argentina 1-0 (a.e.t.) — Spain champions, Argentina
-- runner-up. Award the two final placement bonuses, PLACEMENT-based per spec §6
-- (scored against the specific match result, not nations.eliminated):
--   • champion  → milestone 'win'   (+50) to holders of the Final WINNER
--   • runner-up → milestone 'final' (+40) to holders of the Final LOSER
-- (DB milestone strings are 'win'/'final' — 'runner-up' would violate the CHECK
-- constraint; 'final' here means the runner-up prize, not "reached the final".)
-- Carried team = sticky holding via coalesce (latest final-phase redraft, else
-- SF/QF/… holding, else onboarding). Winner/loser derived from the match score so
-- a re-run stays correct. Primary-only. Idempotent via on conflict.

-- Champion (+50)
insert into progression_bonus_points
  (league_member_id, nation_id, milestone, pick_type, points)
select lm.id,
  coalesce(f.primary_nation_id, sf.primary_nation_id, qf.primary_nation_id, r16.primary_nation_id, r32.primary_nation_id, lm.primary_nation_id),
  'win', 'primary', 50
from league_members lm
left join member_round_teams f   on f.league_member_id   = lm.id and f.round_id   = 'a0000000-0000-0000-0000-000000000006'
left join member_round_teams sf  on sf.league_member_id  = lm.id and sf.round_id  = 'a0000000-0000-0000-0000-000000000005'
left join member_round_teams qf  on qf.league_member_id  = lm.id and qf.round_id  = 'a0000000-0000-0000-0000-000000000004'
left join member_round_teams r16 on r16.league_member_id = lm.id and r16.round_id = 'a0000000-0000-0000-0000-000000000002'
left join member_round_teams r32 on r32.league_member_id = lm.id and r32.round_id = 'a0000000-0000-0000-0000-000000000003'
where coalesce(f.primary_nation_id, sf.primary_nation_id, qf.primary_nation_id, r16.primary_nation_id, r32.primary_nation_id, lm.primary_nation_id) = (
  select case when m.home_score > m.away_score then m.home_nation_id else m.away_nation_id end from matches m where m.id = 104
)
on conflict (league_member_id, milestone, nation_id) do nothing;

-- Runner-up (+40)
insert into progression_bonus_points
  (league_member_id, nation_id, milestone, pick_type, points)
select lm.id,
  coalesce(f.primary_nation_id, sf.primary_nation_id, qf.primary_nation_id, r16.primary_nation_id, r32.primary_nation_id, lm.primary_nation_id),
  'final', 'primary', 40
from league_members lm
left join member_round_teams f   on f.league_member_id   = lm.id and f.round_id   = 'a0000000-0000-0000-0000-000000000006'
left join member_round_teams sf  on sf.league_member_id  = lm.id and sf.round_id  = 'a0000000-0000-0000-0000-000000000005'
left join member_round_teams qf  on qf.league_member_id  = lm.id and qf.round_id  = 'a0000000-0000-0000-0000-000000000004'
left join member_round_teams r16 on r16.league_member_id = lm.id and r16.round_id = 'a0000000-0000-0000-0000-000000000002'
left join member_round_teams r32 on r32.league_member_id = lm.id and r32.round_id = 'a0000000-0000-0000-0000-000000000003'
where coalesce(f.primary_nation_id, sf.primary_nation_id, qf.primary_nation_id, r16.primary_nation_id, r32.primary_nation_id, lm.primary_nation_id) = (
  select case when m.home_score > m.away_score then m.away_nation_id else m.home_nation_id end from matches m where m.id = 104
)
on conflict (league_member_id, milestone, nation_id) do nothing;
