import { createClient } from "@/lib/supabase/server";

const CURRENT_ROUND_ID = "a0000000-0000-0000-0000-000000000002";
const SQUAD_VALUE_CAP = 100.0;

interface SquadPlayer {
  player_id: number;
  is_starting: boolean;
  is_captain: boolean;
  is_vice_captain: boolean;
}

interface SaveSquadBody {
  league_id: string;
  players: SquadPlayer[];
}

interface PlayerRow {
  id: number;
  nation_id: number;
  position: string;
  current_price: number;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SaveSquadBody;
  const { league_id, players } = body;

  if (!league_id || !Array.isArray(players)) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ── Validate total player count ────────────────────────────
  if (players.length !== 15) {
    return Response.json(
      { error: `Squad must have exactly 15 players, got ${players.length}` },
      { status: 422 }
    );
  }

  // ── Fetch player data ──────────────────────────────────────
  const playerIds = players.map((p) => p.player_id);
  const { data: playerRows, error: playerError } = await supabase
    .from("football_players")
    .select("id, nation_id, position, current_price")
    .in("id", playerIds);

  if (playerError || !playerRows || playerRows.length !== 15) {
    return Response.json({ error: "Invalid player IDs" }, { status: 422 });
  }

  const playerMap = new Map<number, PlayerRow>(
    playerRows.map((p: PlayerRow) => [p.id, p])
  );

  // ── Validate starting 11 vs bench 4 ───────────────────────
  const starting = players.filter((p) => p.is_starting);
  const bench = players.filter((p) => !p.is_starting);

  if (starting.length !== 11) {
    return Response.json(
      { error: `Starting XI must have exactly 11 players, got ${starting.length}` },
      { status: 422 }
    );
  }
  if (bench.length !== 4) {
    return Response.json(
      { error: `Bench must have exactly 4 players, got ${bench.length}` },
      { status: 422 }
    );
  }

  // ── Count positions across full 15 ────────────────────────
  const posCount: Record<string, number> = { gk: 0, def: 0, mid: 0, fwd: 0 };
  for (const p of players) {
    const pr = playerMap.get(p.player_id);
    if (!pr) continue;
    posCount[pr.position] = (posCount[pr.position] ?? 0) + 1;
  }

  if (posCount.gk !== 2) {
    return Response.json({ error: "Must have exactly 2 GKs" }, { status: 422 });
  }
  if (posCount.def !== 5) {
    return Response.json({ error: "Must have exactly 5 DEFs" }, { status: 422 });
  }
  if (posCount.mid !== 5) {
    return Response.json({ error: "Must have exactly 5 MIDs" }, { status: 422 });
  }
  if (posCount.fwd !== 3) {
    return Response.json({ error: "Must have exactly 3 FWDs" }, { status: 422 });
  }

  // ── Validate starting XI positions ────────────────────────
  const startPosCount: Record<string, number> = { gk: 0, def: 0, mid: 0, fwd: 0 };
  for (const p of starting) {
    const pr = playerMap.get(p.player_id);
    if (!pr) continue;
    startPosCount[pr.position] = (startPosCount[pr.position] ?? 0) + 1;
  }

  if (startPosCount.gk < 1) {
    return Response.json(
      { error: "Starting XI must have at least 1 GK" },
      { status: 422 }
    );
  }
  if (startPosCount.def < 3) {
    return Response.json(
      { error: "Starting XI must have at least 3 DEFs" },
      { status: 422 }
    );
  }
  if (startPosCount.mid < 2) {
    return Response.json(
      { error: "Starting XI must have at least 2 MIDs" },
      { status: 422 }
    );
  }
  if (startPosCount.fwd < 1) {
    return Response.json(
      { error: "Starting XI must have at least 1 FWD" },
      { status: 422 }
    );
  }

  // ── Max 3 per nation ───────────────────────────────────────
  const nationCount = new Map<number, number>();
  for (const p of players) {
    const pr = playerMap.get(p.player_id);
    if (!pr) continue;
    nationCount.set(pr.nation_id, (nationCount.get(pr.nation_id) ?? 0) + 1);
  }
  for (const [nationId, count] of nationCount.entries()) {
    if (count > 3) {
      return Response.json(
        { error: `Too many players from nation ${nationId} (max 3)` },
        { status: 422 }
      );
    }
  }

  // ── Budget check ───────────────────────────────────────────
  let totalCost = 0;
  for (const p of players) {
    const pr = playerMap.get(p.player_id);
    if (pr) totalCost += pr.current_price;
  }
  if (totalCost > SQUAD_VALUE_CAP) {
    return Response.json(
      { error: `Squad value ${totalCost.toFixed(1)} exceeds cap ${SQUAD_VALUE_CAP}` },
      { status: 422 }
    );
  }

  // ── Validate captain / VC ──────────────────────────────────
  const captains = players.filter((p) => p.is_captain);
  const vcs = players.filter((p) => p.is_vice_captain);
  if (captains.length > 1) {
    return Response.json({ error: "Only one captain allowed" }, { status: 422 });
  }
  if (vcs.length > 1) {
    return Response.json({ error: "Only one vice-captain allowed" }, { status: 422 });
  }

  // ── Upsert fantasy_squads ──────────────────────────────────
  const { data: squad, error: squadError } = await supabase
    .from("fantasy_squads")
    .upsert(
      {
        league_id,
        user_id: user.id,
        round_id: CURRENT_ROUND_ID,
        squad_value_cap: SQUAD_VALUE_CAP,
      },
      { onConflict: "league_id,user_id,round_id" }
    )
    .select("id")
    .single();

  if (squadError || !squad) {
    return Response.json(
      { error: squadError?.message ?? "Failed to save squad" },
      { status: 500 }
    );
  }

  // ── Delete existing squad players then re-insert ───────────
  const { error: deleteError } = await supabase
    .from("fantasy_squad_players")
    .delete()
    .eq("squad_id", squad.id);

  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  const insertRows = players.map((p) => ({
    squad_id: squad.id,
    player_id: p.player_id,
    is_starting: p.is_starting,
    is_captain: p.is_captain,
    is_vice_captain: p.is_vice_captain,
  }));

  const { error: insertError } = await supabase
    .from("fantasy_squad_players")
    .insert(insertRows);

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  return Response.json({ success: true, squad_id: squad.id }, { status: 200 });
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the user's league
  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return Response.json({ squad: null }, { status: 200 });
  }

  const { data: squad } = await supabase
    .from("fantasy_squads")
    .select("id, squad_value_cap")
    .eq("league_id", membership.league_id)
    .eq("user_id", user.id)
    .eq("round_id", CURRENT_ROUND_ID)
    .single();

  if (!squad) {
    return Response.json({ squad: null }, { status: 200 });
  }

  const { data: squadPlayers } = await supabase
    .from("fantasy_squad_players")
    .select(
      "player_id, is_starting, is_captain, is_vice_captain, football_players(id, name, nation_id, position, current_price, nations(flag_code))"
    )
    .eq("squad_id", squad.id);

  return Response.json({ squad: { ...squad, players: squadPlayers ?? [] } }, { status: 200 });
}
