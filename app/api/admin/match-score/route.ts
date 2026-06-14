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

  // Verify match exists and get nation IDs
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, status, home_nation_id, away_nation_id")
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

  // --- Nation bonus points ---
  const homeNationId = match.home_nation_id as number | null;
  const awayNationId = match.away_nation_id as number | null;

  const homeWin = home_score > away_score;
  const awayWin = away_score > home_score;
  const draw = home_score === away_score;

  const homePoints = homeWin ? 3 : draw ? 1 : 0;
  const awayPoints = awayWin ? 3 : draw ? 1 : 0;

  // Delete existing nation bonus points for this match (handle score corrections)
  const { error: deleteNationBonusError } = await supabase
    .from("nation_bonus_points")
    .delete()
    .eq("match_id", match_id);

  if (deleteNationBonusError) {
    return Response.json(
      { error: `Failed to clear nation bonus points: ${deleteNationBonusError.message}` },
      { status: 500 }
    );
  }

  // Fetch all league members with their nation picks
  const { data: leagueMembers, error: membersError } = await supabase
    .from("league_members")
    .select("id, user_id, primary_nation_id, secondary_nation_id")
    .eq("league_id", league.id);

  if (membersError) {
    return Response.json(
      { error: `Failed to load league members for nation bonus: ${membersError.message}` },
      { status: 500 }
    );
  }

  // Build bonus records
  const bonusRecords: {
    league_member_id: string;
    match_id: number;
    nation_id: number;
    pick_type: string;
    points: number;
  }[] = [];

  for (const member of leagueMembers ?? []) {
    const memberId = member.id as string;
    const primaryNationId = member.primary_nation_id as number | null;
    const secondaryNationId = member.secondary_nation_id as number | null;

    // Check primary nation
    if (primaryNationId !== null) {
      let pts = 0;
      if (homeNationId !== null && primaryNationId === homeNationId) pts = homePoints;
      else if (awayNationId !== null && primaryNationId === awayNationId) pts = awayPoints;
      if (pts > 0) {
        bonusRecords.push({
          league_member_id: memberId,
          match_id,
          nation_id: primaryNationId,
          pick_type: "primary",
          points: pts,
        });
      }
    }

    // Check secondary (wildcard) nation — 2x points
    if (secondaryNationId !== null) {
      let pts = 0;
      if (homeNationId !== null && secondaryNationId === homeNationId) pts = homePoints * 2;
      else if (awayNationId !== null && secondaryNationId === awayNationId) pts = awayPoints * 2;
      if (pts > 0) {
        bonusRecords.push({
          league_member_id: memberId,
          match_id,
          nation_id: secondaryNationId,
          pick_type: "secondary",
          points: pts,
        });
      }
    }
  }

  if (bonusRecords.length > 0) {
    const { error: insertBonusError } = await supabase
      .from("nation_bonus_points")
      .insert(bonusRecords);

    if (insertBonusError) {
      return Response.json(
        { error: `Match scored but failed to insert nation bonus points: ${insertBonusError.message}` },
        { status: 500 }
      );
    }
  }

  return Response.json({ ok: true });
}
