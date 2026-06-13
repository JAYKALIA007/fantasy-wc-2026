import { createClient } from "@/lib/supabase/server";
import { SquadBuilder } from "./squad-builder";
import type { FootballPlayer } from "@/lib/fantasy/types";

interface PlayerRow {
  id: number;
  name: string;
  nation_id: number;
  position: string;
  current_price: number;
  initial_price: number;
  nations: { flag_code: string }[] | { flag_code: string } | null;
}

interface SquadPlayerRow {
  player_id: number;
  is_starting: boolean;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export default async function SquadPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Load all players
  const { data: rawPlayers } = await supabase
    .from("football_players")
    .select("id, name, nation_id, position, current_price, initial_price, nations(flag_code)");

  const players: FootballPlayer[] = (rawPlayers ?? []).map((p: PlayerRow) => ({
    id: p.id,
    name: p.name,
    nation_id: p.nation_id,
    position: p.position as FootballPlayer["position"],
    current_price: Number(p.current_price),
    initial_price: Number(p.initial_price),
    flag_code: Array.isArray(p.nations)
      ? (p.nations[0]?.flag_code ?? "")
      : (p.nations?.flag_code ?? ""),
  }));

  // Load user's existing squad if any
  let existingPlayers: (SquadPlayerRow & { player: FootballPlayer })[] = [];
  let leagueId = "";

  if (user) {
    const { data: membership } = await supabase
      .from("league_members")
      .select("league_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (membership) {
      leagueId = membership.league_id as string;

      const { data: squad } = await supabase
        .from("fantasy_squads")
        .select("id")
        .eq("league_id", membership.league_id)
        .eq("user_id", user.id)
        .eq("round_id", "a0000000-0000-0000-0000-000000000002")
        .single();

      if (squad) {
        const { data: squadPlayers } = await supabase
          .from("fantasy_squad_players")
          .select("player_id, is_starting, is_captain, is_vice_captain")
          .eq("squad_id", squad.id);

        if (squadPlayers) {
          existingPlayers = (squadPlayers as SquadPlayerRow[]).map((sp) => {
            const player = players.find((p) => p.id === sp.player_id);
            return { ...sp, player: player! };
          }).filter((sp) => sp.player != null);
        }
      }
    }
  }

  return (
    <SquadBuilder
      allPlayers={players}
      existingSquadPlayers={existingPlayers}
      leagueId={leagueId}
      hasSquad={existingPlayers.length > 0}
    />
  );
}
