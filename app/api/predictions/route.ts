import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    league_id: string;
    match_id: number;
    predicted_home_score: number;
    predicted_away_score: number;
  };

  const { league_id, match_id, predicted_home_score, predicted_away_score } = body;

  if (
    typeof league_id !== "string" ||
    typeof match_id !== "number" ||
    typeof predicted_home_score !== "number" ||
    typeof predicted_away_score !== "number"
  ) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Fetch match to check deadline
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("kickoff_time, status")
    .eq("id", match_id)
    .single();

  if (matchError || !match) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }

  const kickoff = new Date(match.kickoff_time as string);
  const now = new Date();
  const msUntilKickoff = kickoff.getTime() - now.getTime();
  const minUntilKickoff = msUntilKickoff / 1000 / 60;

  if (minUntilKickoff < 0) {
    return Response.json({ error: "Submission deadline passed" }, { status: 403 });
  }

  // Upsert prediction
  const { error } = await supabase
    .from("predictions")
    .upsert(
      {
        league_id,
        user_id: user.id,
        match_id,
        predicted_home_score,
        predicted_away_score,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "league_id,user_id,match_id" }
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true }, { status: 200 });
}
