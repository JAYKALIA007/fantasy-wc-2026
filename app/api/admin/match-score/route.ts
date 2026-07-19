import { createClient } from "@/lib/supabase/server";
import { holdingForRound, type HoldingRow } from "@/lib/server/holdings";

interface MatchScoreBody {
  match_id: number;
  home_score: number;
  away_score: number;
  advancer_nation_id?: number | null;
}

// Knockout round_id -> the eliminated_in_round tag set on the losing team.
const ROUND_ELIM_TAG: Record<string, string> = {
  "a0000000-0000-0000-0000-000000000003": "ro32",
  "a0000000-0000-0000-0000-000000000002": "r16",
  "a0000000-0000-0000-0000-000000000004": "qf",
  "a0000000-0000-0000-0000-000000000005": "sf",
  "a0000000-0000-0000-0000-000000000006": "final",
  // Intentionally NO 'bronze': the 3rd-place match is a placement game between two
  // already-eliminated SF losers. Tagging it would overwrite their 'sf' tag and
  // break the SF bracket's advancer resolution. Bronze placement comes from the
  // score in the progression migration, not this tag. (Mirrors the edge fn.)
};

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

  const { match_id, home_score, away_score, advancer_nation_id } = body;

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
    .select("id, status, round_id, home_nation_id, away_nation_id")
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

  // Knockout: the admin picks who advanced; the other team is eliminated at this
  // round. Drives bracket standings + progression bonuses. Idempotent — re-saving
  // with a different advancer flips the elimination correctly.
  const elimTag = ROUND_ELIM_TAG[match.round_id as string];
  if (elimTag && typeof advancer_nation_id === "number") {
    if (advancer_nation_id !== match.home_nation_id && advancer_nation_id !== match.away_nation_id) {
      return Response.json({ error: "advancer_nation_id must be one of the two teams" }, { status: 400 });
    }
    const loserId = advancer_nation_id === match.home_nation_id ? match.away_nation_id : match.home_nation_id;
    await supabase.from("nations").update({ eliminated: true, eliminated_in_round: elimTag }).eq("id", loserId);
    await supabase.from("nations").update({ eliminated: false, eliminated_in_round: null }).eq("id", advancer_nation_id);
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

  // Resolve each member's effective held team for THIS match's round. After the
  // RO32 re-draft, the redrafted team — not the group pick — earns the nation
  // bonus. Members who never redrafted carry their group pick forward.
  const memberIds = (leagueMembers ?? []).map((m) => m.id as string);
  const holdingsByMember = new Map<string, HoldingRow[]>();
  if (memberIds.length > 0) {
    // Load ALL of a member's holdings (every round), not just this match's round —
    // holdingForRound does a sticky walk-back to the most recent holding <= this
    // round, so it needs the full history to carry a team forward correctly.
    const { data: holdingRows, error: holdingsError } = await supabase
      .from("member_round_teams")
      .select("league_member_id, round_id, primary_nation_id, secondary_nation_id")
      .in("league_member_id", memberIds);
    if (holdingsError) {
      return Response.json(
        { error: `Failed to load re-draft holdings for nation bonus: ${holdingsError.message}` },
        { status: 500 }
      );
    }
    for (const h of holdingRows ?? []) {
      const mid = h.league_member_id as string;
      const arr = holdingsByMember.get(mid) ?? [];
      arr.push({
        round_id: h.round_id as string,
        primary_nation_id: h.primary_nation_id as number | null,
        secondary_nation_id: h.secondary_nation_id as number | null,
      });
      holdingsByMember.set(mid, arr);
    }
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
    const held = holdingForRound(
      {
        primary_nation_id: member.primary_nation_id as number | null,
        secondary_nation_id: member.secondary_nation_id as number | null,
      },
      holdingsByMember.get(memberId) ?? [],
      match.round_id as string
    );
    const primaryNationId = held.primary_nation_id;
    const secondaryNationId = held.secondary_nation_id;

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

  // Fire "scores updated" push notification — fire-and-forget, don't block response
  void fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://fantasy-wc-2026-ashy.vercel.app"}/api/push/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      title: "Scores in! 🏆",
      body: "Match results are updated — check the leaderboard.",
      url: "/ranks",
    }),
  }).catch(() => {});

  return Response.json({ ok: true });
}
