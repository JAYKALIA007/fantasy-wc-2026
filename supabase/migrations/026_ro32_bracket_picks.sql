-- Bracket-prediction side contest: each player picks the advancer in each of the
-- 16 RO32 ties, before the first RO32 match kicks off. Separate from the main
-- leaderboard (its own standings). One row per (league, user, match).

create table if not exists ro32_bracket_picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id int not null references matches(id),
  advancer_nation_id int not null references nations(id),
  submitted_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (league_id, user_id, match_id)
);

create index if not exists idx_ro32_bracket_league_match
  on ro32_bracket_picks (league_id, match_id);

alter table ro32_bracket_picks enable row level security;
create policy "Anyone can read bracket picks"
  on ro32_bracket_picks for select using (true);
create policy "Users insert their own bracket picks"
  on ro32_bracket_picks for insert with check (auth.uid() = user_id);
create policy "Users update their own bracket picks"
  on ro32_bracket_picks for update using (auth.uid() = user_id);
