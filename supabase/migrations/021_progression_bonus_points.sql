-- Phase 2: progression-bonus ledger for the knockout stage.
-- One row per (member, milestone, team). Idempotency key UNIQUE(member,
-- milestone, nation) — a member earns a given milestone with a given team at
-- most once. Summed into the leaderboard alongside nation_bonus_points.
-- Additive — empty until the knockouts; nothing reads/writes it yet.

create table if not exists progression_bonus_points (
  id uuid primary key default gen_random_uuid(),
  league_member_id uuid not null references league_members(id) on delete cascade,
  nation_id int references nations(id),
  milestone text not null check (milestone in ('ro32', 'r16', 'qf', 'sf', 'final', 'win')),
  pick_type text not null check (pick_type in ('primary', 'secondary')),
  points int not null,
  created_at timestamptz default now(),
  unique (league_member_id, milestone, nation_id)
);

create index if not exists idx_progression_bonus_member
  on progression_bonus_points (league_member_id);

alter table progression_bonus_points enable row level security;
create policy "Anyone can read progression_bonus_points"
  on progression_bonus_points for select using (true);
create policy "Service role can insert progression_bonus_points"
  on progression_bonus_points for insert with check (true);
create policy "Service role can delete progression_bonus_points"
  on progression_bonus_points for delete using (true);
