import { createClient } from "@/lib/supabase/server";

interface StatEntry {
  player_id: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  minutes_played: number;
  clean_sheet: boolean;
}

interface RequestBody {
  match_id: number;
  stats: StatEntry[];
}

export async function POST(request: Request) {
  // Basic auth check via Authorization header: "Bearer <ADMIN_SECRET>"
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token !== adminSecret) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const supabase = await createClient();

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { match_id, stats } = body;

  if (typeof match_id !== "number" || !Array.isArray(stats) || stats.length === 0) {
    return Response.json({ error: "match_id (number) and stats (array) are required" }, { status: 400 });
  }

  // Validate stat entries
  for (const s of stats) {
    if (
      typeof s.player_id !== "number" ||
      typeof s.goals !== "number" ||
      typeof s.assists !== "number" ||
      typeof s.yellow_cards !== "number" ||
      typeof s.red_cards !== "number" ||
      typeof s.minutes_played !== "number" ||
      typeof s.clean_sheet !== "boolean"
    ) {
      return Response.json(
        { error: "Each stat entry must have player_id, goals, assists, yellow_cards, red_cards, minutes_played, clean_sheet" },
        { status: 400 }
      );
    }
  }

  // Verify match exists
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, status")
    .eq("id", match_id)
    .single();

  if (matchError || !match) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }

  // Upsert player stats
  const rows = stats.map((s) => ({
    match_id,
    player_id: s.player_id,
    goals: s.goals,
    assists: s.assists,
    yellow_cards: s.yellow_cards,
    red_cards: s.red_cards,
    minutes_played: s.minutes_played,
    clean_sheet: s.clean_sheet,
  }));

  const { error: upsertError } = await supabase
    .from("player_match_stats")
    .upsert(rows, { onConflict: "match_id,player_id" });

  if (upsertError) {
    return Response.json({ error: upsertError.message }, { status: 500 });
  }

  // Trigger fantasy scoring
  const { error: rpcError } = await supabase.rpc("score_fantasy_match", {
    p_match_id: match_id,
  });

  if (rpcError) {
    return Response.json({ error: `Stats saved but scoring failed: ${rpcError.message}` }, { status: 500 });
  }

  return Response.json({ success: true, match_id, players_processed: stats.length }, { status: 200 });
}
