import { createClient } from "@/lib/supabase/server";

// GET /api/checkpoint-picks?match_id=X
// Returns: { phases: PhaseState[], my_pick: Pick | null }
// Phases are the open/closed rows for the match; my_pick is the caller's pick
// for the currently-open phase (null if not submitted).
export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const matchIdStr = searchParams.get("match_id");
  const matchId = matchIdStr ? parseInt(matchIdStr, 10) : NaN;
  if (!matchIdStr || isNaN(matchId)) {
    return Response.json({ error: "match_id required" }, { status: 400 });
  }

  const { data: phases } = await supabase
    .from("match_checkpoint_phases")
    .select("phase, status, actual_home, actual_away, opened_at, closed_at")
    .eq("match_id", matchId)
    .order("phase");

  const openPhase = (phases ?? []).find((p) => p.status === "open");
  let myPick = null;
  if (openPhase) {
    const { data: pickRow } = await supabase
      .from("live_checkpoint_predictions")
      .select("phase, predicted_home, predicted_away")
      .eq("user_id", user.id)
      .eq("match_id", matchId)
      .eq("phase", openPhase.phase)
      .maybeSingle();
    myPick = pickRow;
  }

  // Also fetch the user's picks for closed/scored phases (for recap)
  const closedPhases = (phases ?? []).filter((p) => ["closed", "scored"].includes(p.status));
  let myClosedPicks: { phase: string; predicted_home: number; predicted_away: number; points: number | null }[] = [];
  if (closedPhases.length > 0) {
    const { data: picks } = await supabase
      .from("live_checkpoint_predictions")
      .select("phase, predicted_home, predicted_away, points")
      .eq("user_id", user.id)
      .eq("match_id", matchId)
      .in("phase", closedPhases.map((p) => p.phase));
    myClosedPicks = (picks ?? []) as typeof myClosedPicks;
  }

  return Response.json({
    phases: phases ?? [],
    my_pick: myPick,
    my_closed_picks: myClosedPicks,
  });
}

// POST /api/checkpoint-picks
// Body: { match_id, phase, predicted_home, predicted_away, league_id }
// Submits or updates a pick for an open phase.
export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    match_id: number;
    phase: string;
    predicted_home: number;
    predicted_away: number;
    league_id: string;
  };

  const { match_id, phase, predicted_home, predicted_away, league_id } = body;

  if (
    typeof match_id !== "number" ||
    typeof phase !== "string" ||
    !["h1", "h2", "et", "pens"].includes(phase) ||
    typeof predicted_home !== "number" ||
    typeof predicted_away !== "number" ||
    typeof league_id !== "string"
  ) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Verify the phase window is open
  const { data: phaseRow } = await supabase
    .from("match_checkpoint_phases")
    .select("status")
    .eq("match_id", match_id)
    .eq("phase", phase)
    .maybeSingle();

  if (!phaseRow || phaseRow.status !== "open") {
    return Response.json({ error: "Checkpoint window is not open" }, { status: 403 });
  }

  const { error } = await supabase
    .from("live_checkpoint_predictions")
    .upsert(
      {
        league_id,
        user_id: user.id,
        match_id,
        phase,
        predicted_home,
        predicted_away,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,match_id,phase" }
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
