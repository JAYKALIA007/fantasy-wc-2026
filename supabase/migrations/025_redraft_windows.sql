-- Re-draft windows: admin-gated open/close per knockout round. Mirrors the
-- transfer_windows pattern. A swap for round R is only accepted while that
-- round's window is open AND now() < closes_at (belt-and-suspenders, same as
-- allow_late_predictions + prediction_deadline). One window per league per round.

create table if not exists redraft_windows (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  round_id uuid not null references rounds(id),
  opens_at timestamptz not null default now(),
  closes_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (league_id, round_id)
);

create index if not exists idx_redraft_windows_league
  on redraft_windows (league_id);

alter table redraft_windows enable row level security;
create policy "Anyone can read redraft_windows"
  on redraft_windows for select using (true);
create policy "Service role can insert redraft_windows"
  on redraft_windows for insert with check (true);
create policy "Service role can update redraft_windows"
  on redraft_windows for update using (true);
