-- Bronze final over: England beat France 6-4 for 3rd place. Award the win-bronze
-- placement bonus (+35) to members whose CARRIED team is the bronze WINNER.
--
-- PLACEMENT-based, not reach-based (see spec §6): scored against the specific
-- match result, NOT nations.eliminated. The bronze loser (France holders) gets
-- nothing beyond the reach-SF +30 already banked. Carried team = sticky holding
-- via coalesce (latest final-phase redraft, else SF/QF/… holding, else the
-- onboarding pick) — a member who redrafted England → a finalist during the Final
-- window is no longer an England holder and correctly does NOT get this. The
-- winner is derived from the match score so a re-run stays correct. Primary-only
-- (single team from R16 on). Idempotent via on conflict.
insert into progression_bonus_points
  (league_member_id, nation_id, milestone, pick_type, points)
select lm.id,
  coalesce(f.primary_nation_id, sf.primary_nation_id, qf.primary_nation_id, r16.primary_nation_id, r32.primary_nation_id, lm.primary_nation_id),
  'bronze', 'primary', 35
from league_members lm
left join member_round_teams f
  on f.league_member_id = lm.id and f.round_id = 'a0000000-0000-0000-0000-000000000006'
left join member_round_teams sf
  on sf.league_member_id = lm.id and sf.round_id = 'a0000000-0000-0000-0000-000000000005'
left join member_round_teams qf
  on qf.league_member_id = lm.id and qf.round_id = 'a0000000-0000-0000-0000-000000000004'
left join member_round_teams r16
  on r16.league_member_id = lm.id and r16.round_id = 'a0000000-0000-0000-0000-000000000002'
left join member_round_teams r32
  on r32.league_member_id = lm.id and r32.round_id = 'a0000000-0000-0000-0000-000000000003'
where coalesce(f.primary_nation_id, sf.primary_nation_id, qf.primary_nation_id, r16.primary_nation_id, r32.primary_nation_id, lm.primary_nation_id) = (
  select case when m.home_score > m.away_score then m.home_nation_id else m.away_nation_id end
  from matches m where m.id = 103
)
on conflict (league_member_id, milestone, nation_id) do nothing;
