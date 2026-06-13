import { createClient } from "@/lib/supabase/server";
import { AutoBuildClient } from "./auto-build-client";
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

export default async function AutoBuildPage() {
  const supabase = await createClient();

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

  return <AutoBuildClient allPlayers={players} />;
}
