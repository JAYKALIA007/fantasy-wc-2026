import { createClient } from "@/lib/supabase/server";

interface MatchScoreBody {
  match_id: number;
  home_score: number;
  away_score: number;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: MatchScoreBody;
  try {
    body = (await request.json()) as MatchScoreBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { match_id, home_score, away_score } = body;

  if (
    typeof match_id !== "number" ||
    typeof home_score !== "number" ||
    typeof away_score !== "number"
  ) {
    return Response.json(
      { error: "match_id, home_score, and away_score are required numbers" },
      { status: 400 }
    );
  }

  if (home_score < 0 || home_score > 20 || away_score < 0 || away_score > 20) {
    return Response.json({ error: "Scores must be between 0 and 20" }, { status: 400 });
  }

  // Verify the caller is a league creator
  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select("id")
    .eq("creator_id", user.id)
    .maybeSingle();

  if (leagueError || !league) {
    return Response.json({ error: "Forbidden: only a league creator can enter match scores" }, { status: 403 });
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

  // Update the match score and mark as finished
  const { error: updateError } = await supabase
    .from("matches")
    .update({ home_score, away_score, status: "finished" })
    .eq("id", match_id);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  // Score all predictions for this match by fetching their IDs and calling score_prediction for each
  const { data: predictions, error: predError } = await supabase
    .from("predictions")
    .select("id")
    .eq("match_id", match_id);

  if (predError) {
    return Response.json(
      { error: `Match score saved but failed to load predictions: ${predError.message}` },
      { status: 500 }
    );
  }

  for (const pred of predictions ?? []) {
    const { error: rpcError } = await supabase.rpc("score_prediction", {
      p_id: pred.id as string,
    });
    if (rpcError) {
      return Response.json(
        { error: `Match score saved but scoring failed for prediction ${pred.id as string}: ${rpcError.message}` },
        { status: 500 }
      );
    }
  }

  return Response.json({ ok: true });
}
