import { createClient } from "@/lib/supabase/server";
import { ROUND_IDS } from "@/lib/constants";
import { computeLeaderboard } from "@/lib/server/leaderboard";

// The goalscorer wager is only offered on the 4 remaining knockout fixtures:
// the two semis (sf), the final, and the 3rd-place playoff (bronze).
const WAGER_ROUND_IDS: string[] = [ROUND_IDS.sf, ROUND_IDS.final, ROUND_IDS.bronze];

const STAKE = 10;

interface WagerBody {
  match_id: number;
  player_id: number;
}

// Resolve the caller's membership + league admin (needed for the balance gate,
// which reads the league leaderboard). Returns null with a Response on failure.
async function resolveContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<{ leagueId: string; adminUserId: string | null } | { error: Response }> {
  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return { error: Response.json({ error: "Not in a league" }, { status: 403 }) };
  const leagueId = membership.league_id as string;
  const { data: league } = await supabase.from("leagues").select("creator_id").eq("id", leagueId).single();
  return { leagueId, adminUserId: (league?.creator_id as string | null) ?? null };
}

// available = realized bankroll − 10 × (open/pending wagers). The reserve on
// pending wagers is what makes negative scores impossible: you can never commit
// more stake than you hold, so if every open wager loses you bottom out at 0.
async function computeAvailable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  leagueId: string,
  adminUserId: string | null,
  userId: string
): Promise<number> {
  const rows = await computeLeaderboard(supabase, leagueId, adminUserId, null);
  const me = rows.find((r) => r.user_id === userId);
  // base = everything EXCEPT wagers; total already folds wager_points in.
  const base = (me?.total_points ?? 0) - (me?.wager_points ?? 0);
  const { data: myWagers } = await supabase
    .from("goalscorer_wagers")
    .select("status")
    .eq("league_id", leagueId)
    .eq("user_id", userId);
  let settledNet = 0;
  let pending = 0;
  for (const w of myWagers ?? []) {
    if (w.status === "won") settledNet += 5;
    else if (w.status === "lost") settledNet -= STAKE;
    else pending += 1;
  }
  const bankroll = base + settledNet;
  return bankroll - STAKE * pending;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: WagerBody;
  try {
    body = (await request.json()) as WagerBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { match_id: matchId, player_id: playerId } = body;
  if (typeof matchId !== "number" || typeof playerId !== "number") {
    return Response.json({ error: "match_id and player_id are required" }, { status: 400 });
  }

  const ctx = await resolveContext(supabase, user.id);
  if ("error" in ctx) return ctx.error;
  const { leagueId, adminUserId } = ctx;

  // Match must be a wager-eligible fixture and not yet kicked off (kickoff = lock).
  const { data: match } = await supabase
    .from("matches")
    .select("id, kickoff_time, round_id, home_nation_id, away_nation_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
  if (!WAGER_ROUND_IDS.includes(match.round_id as string)) {
    return Response.json({ error: "Wagers aren't available on this match" }, { status: 403 });
  }
  if (new Date() >= new Date(match.kickoff_time as string)) {
    return Response.json({ error: "This match has locked" }, { status: 403 });
  }

  // Player must exist and belong to one of the two teams in this match.
  const { data: player } = await supabase
    .from("football_players")
    .select("id, name, nation_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!player) return Response.json({ error: "Player not found" }, { status: 404 });
  if (player.nation_id !== match.home_nation_id && player.nation_id !== match.away_nation_id) {
    return Response.json({ error: "That player isn't in this match" }, { status: 400 });
  }

  // No duplicate player per match (also enforced by the unique constraint).
  const { data: dupe } = await supabase
    .from("goalscorer_wagers")
    .select("id")
    .eq("league_id", leagueId)
    .eq("user_id", user.id)
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (dupe) return Response.json({ error: "You already backed this player" }, { status: 409 });

  // Balance gate.
  const available = await computeAvailable(supabase, leagueId, adminUserId, user.id);
  if (available < STAKE) {
    return Response.json(
      { error: `Not enough points — you need ${STAKE}, available ${Math.max(0, available)}` },
      { status: 403 }
    );
  }

  const { error: insertErr } = await supabase.from("goalscorer_wagers").insert({
    league_id: leagueId,
    user_id: user.id,
    match_id: matchId,
    player_id: playerId,
    espn_name: player.name,
    stake: STAKE,
    payout: 15,
    status: "pending",
  });
  if (insertErr) {
    // Unique-violation race → treat as duplicate.
    if ((insertErr as { code?: string }).code === "23505") {
      return Response.json({ error: "You already backed this player" }, { status: 409 });
    }
    return Response.json({ error: insertErr.message }, { status: 500 });
  }
  return Response.json({ ok: true, available: available - STAKE });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: WagerBody;
  try {
    body = (await request.json()) as WagerBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { match_id: matchId, player_id: playerId } = body;
  if (typeof matchId !== "number" || typeof playerId !== "number") {
    return Response.json({ error: "match_id and player_id are required" }, { status: 400 });
  }

  const ctx = await resolveContext(supabase, user.id);
  if ("error" in ctx) return ctx.error;
  const { leagueId } = ctx;

  // Can only cancel before kickoff — once locked, the stake is committed.
  const { data: match } = await supabase
    .from("matches")
    .select("kickoff_time")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
  if (new Date() >= new Date(match.kickoff_time as string)) {
    return Response.json({ error: "This match has locked — the wager is committed" }, { status: 403 });
  }

  const { error: delErr } = await supabase
    .from("goalscorer_wagers")
    .delete()
    .eq("league_id", leagueId)
    .eq("user_id", user.id)
    .eq("match_id", matchId)
    .eq("player_id", playerId)
    .eq("status", "pending");
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });
  return Response.json({ ok: true });
}
