import { createClient } from "@/lib/supabase/server";
import { ROUND_IDS } from "@/lib/constants";

interface BracketBody {
  picks: { match_id: number; advancer_nation_id: number }[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: BracketBody;
  try {
    body = (await request.json()) as BracketBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.picks) || body.picks.length === 0) {
    return Response.json({ error: "picks array is required" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return Response.json({ error: "Not a member" }, { status: 403 });
  const leagueId = membership.league_id as string;

  // The 16 RO32 ties, with their two valid teams and kickoff.
  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_nation_id, away_nation_id, kickoff_time")
    .eq("round_id", ROUND_IDS.ro32);
  const byId = new Map((matches ?? []).map((m) => [m.id as number, m]));

  // Bracket locks at the earliest RO32 kickoff.
  const earliest = (matches ?? []).reduce<number | null>((min, m) => {
    const t = new Date(m.kickoff_time as string).getTime();
    return min === null || t < min ? t : min;
  }, null);
  if (earliest !== null && Date.now() >= earliest) {
    return Response.json({ error: "Bracket is locked — the Round of 32 has started" }, { status: 403 });
  }

  // Validate every pick: match exists and advancer is one of its two teams.
  for (const p of body.picks) {
    const m = byId.get(p.match_id);
    if (!m) return Response.json({ error: `Unknown match ${p.match_id}` }, { status: 400 });
    if (p.advancer_nation_id !== m.home_nation_id && p.advancer_nation_id !== m.away_nation_id) {
      return Response.json({ error: `Invalid advancer for match ${p.match_id}` }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const rows = body.picks.map((p) => ({
    league_id: leagueId,
    user_id: user.id,
    match_id: p.match_id,
    advancer_nation_id: p.advancer_nation_id,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("ro32_bracket_picks")
    .upsert(rows, { onConflict: "league_id,user_id,match_id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true, count: rows.length }, { status: 200 });
}
