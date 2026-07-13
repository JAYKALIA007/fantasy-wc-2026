-- Goalscorer Wager: an OPTIONAL side bet available on the 4 remaining knockout
-- fixtures (2 semis + final + 3rd place). A member stakes a fixed 10 pts to
-- name one player they think scores (anytime, in regulation or extra time only —
-- shootout goals never count, own goals don't count). Correct → +15 (net +5),
-- wrong → the 10 is gone (net -10). Binary: one goal or a hat-trick both pay +15.
--
-- Grading is automated from the ESPN scorer feed (same endpoint the auto-score
-- cron already hits). espn_name is the exact ESPN displayName snapshotted at
-- placement, so settling is an exact name-set membership check, not a fuzzy match.
--
-- Balance gate (enforced in the API, not here): available = points - 10*(open
-- wagers); need >= 10 to place. That makes negative scores impossible — the gate
-- is the floor at 0. A wager locks at its match's kickoff; until then it is fully
-- editable (add / cancel with full refund of the reserved 10).
create table if not exists goalscorer_wagers (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  match_id int not null references matches(id),
  player_id int not null references football_players(id),
  -- Exact ESPN displayName at placement; the grade key. Snapshotted so a later
  -- roster/name change upstream can't silently break settlement.
  espn_name text not null,
  stake int not null default 10,
  payout int not null default 15,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost')),
  submitted_at timestamptz default now(),
  updated_at timestamptz default now(),
  settled_at timestamptz,
  -- No duplicate player per match per member: you can spread across many players
  -- but can't stack the same one (that would be back-door variable staking).
  unique (league_id, user_id, match_id, player_id)
);

create index if not exists goalscorer_wagers_match_idx on goalscorer_wagers (match_id);
create index if not exists goalscorer_wagers_member_idx on goalscorer_wagers (league_id, user_id);
