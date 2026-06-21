-- Phase 1 of the knockout-stage team reassignment feature.
-- See docs/knockout-reassignment-spec.md. This migration is purely ADDITIVE:
-- it seeds the missing knockout rounds and creates two new tables. Nothing
-- reads these yet — wiring happens in later phases. Safe to run mid-tournament.

-- ---------------------------------------------------------------------------
-- 1. Seed the full WC2026 round ladder.
--    group_stage (a0..01) already exists; r16 (a0..02) already exists (dates
--    refreshed below). RO32/QF/SF/Final are new. Idempotent upserts — ordering
--    is by start_date, so UUID order does not matter.
--    Dates are the official WC2026 schedule; admin can adjust later.
-- ---------------------------------------------------------------------------
insert into rounds (id, name, start_date, end_date) values
  ('a0000000-0000-0000-0000-000000000003', 'ro32',  '2026-06-28', '2026-07-03'),
  ('a0000000-0000-0000-0000-000000000002', 'r16',   '2026-07-04', '2026-07-07'),
  ('a0000000-0000-0000-0000-000000000004', 'qf',    '2026-07-09', '2026-07-11'),
  ('a0000000-0000-0000-0000-000000000005', 'sf',    '2026-07-14', '2026-07-15'),
  ('a0000000-0000-0000-0000-000000000006', 'final', '2026-07-19', '2026-07-19')
on conflict (id) do update
  set name = excluded.name,
      start_date = excluded.start_date,
      end_date = excluded.end_date;

-- ---------------------------------------------------------------------------
-- 2. member_round_teams — per-member, per-round record of which teams a player
--    held, and whether each was a (penalized) swap vs the previous round.
--    Source of truth for "what did you hold in round R". The live
--    league_members.primary/secondary_nation_id remains the group-stage pick;
--    knockout holdings live here.
-- ---------------------------------------------------------------------------
create table if not exists member_round_teams (
  id uuid primary key default gen_random_uuid(),
  league_member_id uuid not null references league_members(id) on delete cascade,
  round_id uuid not null references rounds(id),
  primary_nation_id int references nations(id),
  secondary_nation_id int references nations(id),
  primary_swapped boolean not null default false,
  secondary_swapped boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (league_member_id, round_id)
);

create index if not exists idx_member_round_teams_round
  on member_round_teams (round_id);

alter table member_round_teams enable row level security;
create policy "Anyone can read member_round_teams"
  on member_round_teams for select using (true);
create policy "Service role can insert member_round_teams"
  on member_round_teams for insert with check (true);
create policy "Service role can update member_round_teams"
  on member_round_teams for update using (true);
create policy "Service role can delete member_round_teams"
  on member_round_teams for delete using (true);

-- ---------------------------------------------------------------------------
-- 3. swap_penalties — points ledger for reassignment penalties. amount is a
--    POSITIVE magnitude; computeLeaderboard will SUBTRACT sum(amount).
--    Mirrors the nation_bonus_points pattern (per-member points rows).
-- ---------------------------------------------------------------------------
create table if not exists swap_penalties (
  id uuid primary key default gen_random_uuid(),
  league_member_id uuid not null references league_members(id) on delete cascade,
  round_id uuid not null references rounds(id),
  pick_type text not null check (pick_type in ('primary', 'secondary')),
  amount int not null check (amount >= 0),
  created_at timestamptz default now()
);

create index if not exists idx_swap_penalties_member
  on swap_penalties (league_member_id);

alter table swap_penalties enable row level security;
create policy "Anyone can read swap_penalties"
  on swap_penalties for select using (true);
create policy "Service role can insert swap_penalties"
  on swap_penalties for insert with check (true);
create policy "Service role can delete swap_penalties"
  on swap_penalties for delete using (true);
