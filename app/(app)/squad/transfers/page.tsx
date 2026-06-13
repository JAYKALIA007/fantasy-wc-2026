import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { FootballPlayer, Position } from "@/lib/fantasy/types";
import { TransfersClient } from "./transfers-client";
import type { SquadPlayerWithDetails } from "./transfers-client";

const CURRENT_ROUND_ID = "a0000000-0000-0000-0000-000000000002";
const ROUND_LABEL = "R16";

interface PlayerRow {
  id: number;
  name: string;
  nation_id: number;
  position: string;
  current_price: number;
  initial_price: number;
  nations:
    | { flag_code: string; eliminated: boolean }[]
    | { flag_code: string; eliminated: boolean }
    | null;
}

interface SquadPlayerRow {
  player_id: number;
  is_starting: boolean;
  is_captain: boolean;
  is_vice_captain: boolean;
}

interface TransferWindowRow {
  id: string;
  round_id: string;
  window_number: number;
  opens_at: string;
  closes_at: string;
}

export default async function TransfersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load all players
  const { data: rawPlayers } = await supabase
    .from("football_players")
    .select(
      "id, name, nation_id, position, current_price, initial_price, nations(flag_code, eliminated)"
    );

  const allPlayers: FootballPlayer[] = (rawPlayers ?? []).map((p: PlayerRow) => ({
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

  // Load transfer windows
  const { data: windows } = await supabase
    .from("transfer_windows")
    .select("id, round_id, window_number, opens_at, closes_at")
    .eq("round_id", CURRENT_ROUND_ID)
    .order("window_number", { ascending: true });

  const transferWindows: TransferWindowRow[] = (windows ?? []) as TransferWindowRow[];

  // Load user's squad
  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    redirect("/");
  }

  const leagueId = membership.league_id as string;

  const { data: squad } = await supabase
    .from("fantasy_squads")
    .select("id, squad_value_cap")
    .eq("league_id", leagueId)
    .eq("user_id", user.id)
    .eq("round_id", CURRENT_ROUND_ID)
    .single();

  if (!squad) {
    redirect("/squad");
  }

  const { data: squadPlayers } = await supabase
    .from("fantasy_squad_players")
    .select("player_id, is_starting, is_captain, is_vice_captain")
    .eq("squad_id", squad.id);

  const squadWithDetails: SquadPlayerWithDetails[] = ((squadPlayers ?? []) as SquadPlayerRow[])
    .reduce<SquadPlayerWithDetails[]>((acc, sp) => {
      const rawPlayer = (rawPlayers ?? []).find((p: PlayerRow) => p.id === sp.player_id);
      if (!rawPlayer) return acc;
      const nObj = Array.isArray(rawPlayer.nations)
        ? rawPlayer.nations[0]
        : rawPlayer.nations;
      acc.push({
        player_id: sp.player_id,
        is_starting: sp.is_starting,
        is_captain: sp.is_captain,
        is_vice_captain: sp.is_vice_captain,
        player: {
          id: rawPlayer.id,
          name: rawPlayer.name,
          nation_id: rawPlayer.nation_id,
          position: rawPlayer.position as Position,
          current_price: Number(rawPlayer.current_price),
          initial_price: Number(rawPlayer.initial_price),
          flag_code: nObj?.flag_code ?? "",
          eliminated: nObj?.eliminated ?? false,
        },
      });
      return acc;
    }, []);

  return (
    <TransfersClient
      squadPlayers={squadWithDetails}
      allPlayers={allPlayers}
      leagueId={leagueId}
      currentCap={Number(squad.squad_value_cap)}
      transferWindows={transferWindows}
      roundLabel={ROUND_LABEL}
    />
  );
}
