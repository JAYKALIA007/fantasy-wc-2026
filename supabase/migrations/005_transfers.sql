create table fantasy_transfers (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id),
  user_id uuid not null references profiles(id),
  round_id uuid not null,
  player_out_id int not null references football_players(id),
  player_in_id int not null references football_players(id),
  transferred_at timestamptz default now(),
  is_free boolean not null default false,
  cap_cost decimal(3,1) not null default 1.0
);

create table transfer_windows (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null,
  window_number int not null default 1,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  manually_triggered boolean not null default false
);

alter table fantasy_transfers enable row level security;
alter table transfer_windows enable row level security;

create policy "Users can read own transfers" on fantasy_transfers for select using (auth.uid() = user_id);
create policy "Users can insert own transfers" on fantasy_transfers for insert with check (auth.uid() = user_id);
create policy "Anyone can read transfer_windows" on transfer_windows for select using (true);

-- Seed two transfer windows for R16 (round a0000000-0000-0000-0000-000000000002)
-- Window 1: open now for 24hrs, Window 2: opens in 2 days for 24hrs
insert into transfer_windows (round_id, window_number, opens_at, closes_at) values
  ('a0000000-0000-0000-0000-000000000002', 1, now() - interval '1 hour', now() + interval '23 hours'),
  ('a0000000-0000-0000-0000-000000000002', 2, now() + interval '2 days', now() + interval '3 days');

-- Squad carryover function
create or replace function carryover_squad(p_user_id uuid, p_league_id uuid, p_from_round_id uuid, p_to_round_id uuid)
returns void language plpgsql security definer as $$
declare
  old_squad_id uuid;
  new_squad_id uuid;
  old_cap decimal;
begin
  select id, squad_value_cap into old_squad_id, old_cap
  from fantasy_squads
  where user_id = p_user_id and league_id = p_league_id and round_id = p_from_round_id;

  if old_squad_id is null then return; end if;

  -- Check if new squad already exists
  if exists (select 1 from fantasy_squads where user_id = p_user_id and league_id = p_league_id and round_id = p_to_round_id) then
    return;
  end if;

  insert into fantasy_squads (league_id, user_id, round_id, squad_value_cap)
  values (p_league_id, p_user_id, p_to_round_id, old_cap)
  returning id into new_squad_id;

  insert into fantasy_squad_players (squad_id, player_id, is_starting, is_captain, is_vice_captain)
  select new_squad_id, player_id, is_starting, is_captain, is_vice_captain
  from fantasy_squad_players where squad_id = old_squad_id;
end;
$$;
