create table player_match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id int not null references matches(id),
  player_id int not null references football_players(id),
  goals int not null default 0,
  assists int not null default 0,
  yellow_cards int not null default 0,
  red_cards int not null default 0,
  minutes_played int not null default 0,
  clean_sheet boolean not null default false,
  fantasy_points int,
  fetched_at timestamptz default now(),
  unique (match_id, player_id)
);

create table fantasy_round_scores (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id),
  user_id uuid not null references profiles(id),
  round_id uuid not null,
  total_points int not null default 0,
  unique (league_id, user_id, round_id)
);

alter table player_match_stats enable row level security;
alter table fantasy_round_scores enable row level security;

create policy "Anyone can read player_match_stats" on player_match_stats for select using (true);
create policy "Anyone can read fantasy_round_scores" on fantasy_round_scores for select using (true);

create index on fantasy_round_scores (league_id, round_id);
create index on player_match_stats (match_id);

-- Fantasy points computation function
create or replace function compute_fantasy_points(
  p_goals int, p_assists int, p_yellow_cards int, p_red_cards int,
  p_minutes_played int, p_clean_sheet boolean, p_position text
) returns int language plpgsql as $$
begin
  return
    (p_goals * 5) +
    (p_assists * 3) +
    (case when p_clean_sheet and p_position in ('gk','def') then 4 else 0 end) +
    (p_yellow_cards * -1) +
    (p_red_cards * -3) +
    (case when p_minutes_played >= 60 then 1 else 0 end);
end;
$$;

-- Score a single match for all leagues (call after match finishes)
create or replace function score_fantasy_match(p_match_id int)
returns void language plpgsql security definer as $$
declare
  stat_row player_match_stats%rowtype;
  squad_row record;
  pts int;
  cap_pts int;
begin
  for stat_row in
    select pms.*, fp.position
    from player_match_stats pms
    join football_players fp on fp.id = pms.player_id
    where pms.match_id = p_match_id
  loop
    pts := compute_fantasy_points(
      stat_row.goals, stat_row.assists, stat_row.yellow_cards,
      stat_row.red_cards, stat_row.minutes_played, stat_row.clean_sheet,
      (select position from football_players where id = stat_row.player_id)
    );

    update player_match_stats set fantasy_points = pts
    where id = stat_row.id;

    -- Find all squads with this player as starting and apply points
    for squad_row in
      select fs.id as squad_id, fs.user_id, fs.league_id,
             fsp.is_captain, fsp.is_vice_captain,
             m.round_id
      from fantasy_squad_players fsp
      join fantasy_squads fs on fs.id = fsp.squad_id
      join matches m on m.id = p_match_id
      where fsp.player_id = stat_row.player_id and fsp.is_starting = true
    loop
      cap_pts := pts;

      -- Captain doubles; vice-captain doubles only if captain DNP
      if squad_row.is_captain then
        cap_pts := pts * 2;
      elsif squad_row.is_vice_captain then
        -- Check if captain played (minutes_played > 0)
        if not exists (
          select 1 from fantasy_squad_players fsp2
          join player_match_stats pms2 on pms2.player_id = fsp2.player_id and pms2.match_id = p_match_id
          where fsp2.squad_id = squad_row.squad_id and fsp2.is_captain = true and pms2.minutes_played > 0
        ) then
          cap_pts := pts * 2;
        end if;
      end if;

      insert into fantasy_round_scores (league_id, user_id, round_id, total_points)
      values (squad_row.league_id, squad_row.user_id, squad_row.round_id, cap_pts)
      on conflict (league_id, user_id, round_id)
      do update set total_points = fantasy_round_scores.total_points + excluded.total_points;
    end loop;
  end loop;
end;
$$;

-- Price rise function (call after round ends)
create or replace function apply_price_rises(p_round_id uuid)
returns void language plpgsql security definer as $$
begin
  update football_players fp
  set current_price = greatest(current_price, fp.current_price + 0.5)
  where fp.id in (
    select pms.player_id
    from player_match_stats pms
    join matches m on m.id = pms.match_id
    where m.round_id = p_round_id and pms.fantasy_points >= 5
  );
end;
$$;

-- Seed some player stats for the 2 finished matches (match IDs 7 and 8)
-- Match 7: Uruguay 2-1 Senegal
insert into player_match_stats (match_id, player_id, goals, assists, minutes_played, fantasy_points) values
  (7, 52, 1, 1, 90, 9),   -- Messi (ARG placeholder, use as Uruguay stand-in)
  (7, 53, 1, 0, 90, 6),   -- Lautaro
  (7, 43, 0, 0, 90, 1),   -- Mbappe (Senegal stand-in)
  (8, 27, 0, 0, 90, 1),   -- Pedri (Australia stand-in)
  (8, 28, 0, 0, 90, 1)    -- Rodri
on conflict (match_id, player_id) do nothing;
