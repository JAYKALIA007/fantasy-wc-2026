import { createClient } from "@/lib/supabase/server";

const CURRENT_ROUND_ID = "a0000000-0000-0000-0000-000000000002";

interface TransferBody {
  league_id: string;
  player_out_id: number;
  player_in_id: number;
}

interface TransferWindowRow {
  opens_at: string;
  closes_at: string;
}

interface NationRow {
  eliminated: boolean;
}

interface PlayerNationRow {
  nation_id: number;
  nations: NationRow | NationRow[] | null;
}

interface SquadPlayerRow {
  player_id: number;
  is_starting: boolean;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as TransferBody;
  const { league_id, player_out_id, player_in_id } = body;

  if (!league_id || !player_out_id || !player_in_id) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (player_out_id === player_in_id) {
    return Response.json({ error: "Cannot transfer a player for themselves" }, { status: 400 });
  }

  // Fetch current squad
  const { data: squad, error: squadError } = await supabase
    .from("fantasy_squads")
    .select("id, squad_value_cap")
    .eq("league_id", league_id)
    .eq("user_id", user.id)
    .eq("round_id", CURRENT_ROUND_ID)
    .single();

  if (squadError || !squad) {
    return Response.json({ error: "Squad not found" }, { status: 404 });
  }

  // Fetch squad players
  const { data: squadPlayers, error: spError } = await supabase
    .from("fantasy_squad_players")
    .select("player_id, is_starting, is_captain, is_vice_captain")
    .eq("squad_id", squad.id);

  if (spError || !squadPlayers) {
    return Response.json({ error: "Failed to fetch squad players" }, { status: 500 });
  }

  const playerOutSlot = (squadPlayers as SquadPlayerRow[]).find(
    (p) => p.player_id === player_out_id
  );
  if (!playerOutSlot) {
    return Response.json({ error: "Player to transfer out is not in squad" }, { status: 400 });
  }

  // Check if player_in is already in squad
  const playerInAlready = (squadPlayers as SquadPlayerRow[]).find(
    (p) => p.player_id === player_in_id
  );
  if (playerInAlready) {
    return Response.json({ error: "Player to transfer in is already in squad" }, { status: 400 });
  }

  // Check if current time is within any open transfer window
  const now = new Date().toISOString();
  const { data: openWindows } = await supabase
    .from("transfer_windows")
    .select("opens_at, closes_at")
    .eq("round_id", CURRENT_ROUND_ID)
    .lte("opens_at", now)
    .gte("closes_at", now);

  const isWindowOpen = (openWindows as TransferWindowRow[] | null)?.length ? (openWindows as TransferWindowRow[]).length > 0 : false;

  // Check if player_out's nation is eliminated
  const { data: playerOutData } = await supabase
    .from("football_players")
    .select("nation_id, nations(eliminated)")
    .eq("id", player_out_id)
    .single();

  const playerOutNation = playerOutData as PlayerNationRow | null;
  const nationsData = playerOutNation?.nations;
  const nationRow = Array.isArray(nationsData) ? nationsData[0] : nationsData;
  const isEliminated = nationRow?.eliminated === true;

  const isFree = isWindowOpen || isEliminated;
  const capCost = isFree ? 0.0 : 1.0;

  // If NOT free: decrement squad_value_cap by 1.0
  if (!isFree) {
    const newCap = Number(squad.squad_value_cap) - 1.0;
    const { error: capError } = await supabase
      .from("fantasy_squads")
      .update({ squad_value_cap: newCap })
      .eq("id", squad.id);

    if (capError) {
      return Response.json({ error: "Failed to update cap" }, { status: 500 });
    }
  }

  // Swap player in fantasy_squad_players
  const { error: deleteError } = await supabase
    .from("fantasy_squad_players")
    .delete()
    .eq("squad_id", squad.id)
    .eq("player_id", player_out_id);

  if (deleteError) {
    return Response.json({ error: "Failed to remove player" }, { status: 500 });
  }

  const { error: insertError } = await supabase
    .from("fantasy_squad_players")
    .insert({
      squad_id: squad.id,
      player_id: player_in_id,
      is_starting: playerOutSlot.is_starting,
      is_captain: playerOutSlot.is_captain,
      is_vice_captain: playerOutSlot.is_vice_captain,
    });

  if (insertError) {
    return Response.json({ error: "Failed to add player" }, { status: 500 });
  }

  // Insert fantasy_transfers record
  const { error: transferError } = await supabase
    .from("fantasy_transfers")
    .insert({
      league_id,
      user_id: user.id,
      round_id: CURRENT_ROUND_ID,
      player_out_id,
      player_in_id,
      is_free: isFree,
      cap_cost: capCost,
    });

  if (transferError) {
    return Response.json({ error: "Failed to record transfer" }, { status: 500 });
  }

  // Fetch updated squad
  const { data: updatedSquad } = await supabase
    .from("fantasy_squads")
    .select("id, squad_value_cap")
    .eq("id", squad.id)
    .single();

  const { data: updatedPlayers } = await supabase
    .from("fantasy_squad_players")
    .select(
      "player_id, is_starting, is_captain, is_vice_captain, football_players(id, name, nation_id, position, current_price, nations(flag_code, eliminated))"
    )
    .eq("squad_id", squad.id);

  return Response.json(
    {
      success: true,
      is_free: isFree,
      cap_cost: capCost,
      squad: {
        ...(updatedSquad ?? {}),
        players: updatedPlayers ?? [],
      },
    },
    { status: 200 }
  );
}
