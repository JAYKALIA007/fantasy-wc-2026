-- Live in-play checkpoint predictions for knockout matches.
-- Two tables: phase state (one row per match×phase) and player picks.
-- Round-agnostic: keyed by match_id only, reuses across RO16→Final.

-- Phase state table: source of truth for window state and boundary results.
-- status: pending → open → closed → scored
create table if not exists match_checkpoint_phases (
  id             uuid primary key default gen_random_uuid(),
  match_id       int not null references matches(id) on delete cascade,
  phase          text not null check (phase in ('h1', 'h2', 'et', 'pens')),
  status         text not null default 'pending'
                   check (status in ('pending', 'open', 'closed', 'scored')),
  actual_home    int,
  actual_away    int,
  opened_at      timestamptz,
  closed_at      timestamptz,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (match_id, phase)
);

create index if not exists idx_checkpoint_phases_match
  on match_checkpoint_phases (match_id);

alter table match_checkpoint_phases enable row level security;
-- Anyone can read phase state (needed by player UI to know open windows)
create policy "Anyone can read checkpoint phases"
  on match_checkpoint_phases for select using (true);
-- Only service role can write (admin route uses service client)
create policy "Service role manages checkpoint phases"
  on match_checkpoint_phases for all using (auth.role() = 'service_role');

-- Player picks: one row per (user, match, phase). Points stored here.
create table if not exists live_checkpoint_predictions (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  match_id       int not null references matches(id) on delete cascade,
  phase          text not null check (phase in ('h1', 'h2', 'et', 'pens')),
  predicted_home int not null,
  predicted_away int not null,
  points         int,
  submitted_at   timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (user_id, match_id, phase)
);

create index if not exists idx_live_preds_league_match
  on live_checkpoint_predictions (league_id, match_id);
create index if not exists idx_live_preds_user_match
  on live_checkpoint_predictions (user_id, match_id);

alter table live_checkpoint_predictions enable row level security;

-- A player can read their own picks at any time.
-- Other players can only read picks for CLOSED or SCORED phases (privacy gate).
create policy "Users read own picks"
  on live_checkpoint_predictions for select
  using (auth.uid() = user_id);

create policy "Others read picks after window closes"
  on live_checkpoint_predictions for select
  using (
    auth.uid() != user_id
    and exists (
      select 1 from match_checkpoint_phases p
      where p.match_id = live_checkpoint_predictions.match_id
        and p.phase   = live_checkpoint_predictions.phase
        and p.status in ('closed', 'scored')
    )
  );

create policy "Users insert own picks"
  on live_checkpoint_predictions for insert
  with check (auth.uid() = user_id);

create policy "Users update own picks"
  on live_checkpoint_predictions for update
  using (auth.uid() = user_id);

-- Service role manages scoring (points column)
create policy "Service role manages live predictions"
  on live_checkpoint_predictions for all using (auth.role() = 'service_role');
