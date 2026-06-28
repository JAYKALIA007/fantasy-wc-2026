import { createClient } from "@/lib/supabase/server";

interface RedraftWindowBody {
  league_id: string;
  round_id: string;
  action: "open" | "close";
  closes_at?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RedraftWindowBody;
  try {
    body = (await request.json()) as RedraftWindowBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { league_id: leagueId, round_id: roundId, action, closes_at: closesAtInput } = body;

  if (!leagueId || !roundId || !action) {
    return Response.json({ error: "league_id, round_id, and action are required" }, { status: 400 });
  }

  if (action !== "open" && action !== "close") {
    return Response.json({ error: "action must be 'open' or 'close'" }, { status: 400 });
  }

  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select("creator_id")
    .eq("id", leagueId)
    .single();

  if (leagueError || !league) {
    return Response.json({ error: "League not found" }, { status: 404 });
  }

  if (league.creator_id !== user.id) {
    return Response.json({ error: "Forbidden: only the league creator can manage re-draft windows" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const closesAt =
    action === "close"
      ? now
      : closesAtInput ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: existing } = await supabase
    .from("redraft_windows")
    .select("id")
    .eq("league_id", leagueId)
    .eq("round_id", roundId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("redraft_windows")
      .update({ status: action === "open" ? "open" : "closed", opens_at: now, closes_at: closesAt, updated_at: now })
      .eq("id", existing.id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("redraft_windows").insert({
      league_id: leagueId,
      round_id: roundId,
      status: action === "open" ? "open" : "closed",
      opens_at: now,
      closes_at: closesAt,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ success: true, action }, { status: 200 });
}
