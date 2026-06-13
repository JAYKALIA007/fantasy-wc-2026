import { createClient } from "@/lib/supabase/server";

interface TransferWindowBody {
  league_id: string;
  round_id: string;
  action: "open" | "close";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TransferWindowBody;
  try {
    body = (await request.json()) as TransferWindowBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { league_id: leagueId, round_id: roundId, action } = body;

  if (!leagueId || !roundId || !action) {
    return Response.json({ error: "league_id, round_id, and action are required" }, { status: 400 });
  }

  if (action !== "open" && action !== "close") {
    return Response.json({ error: "action must be 'open' or 'close'" }, { status: 400 });
  }

  // Verify requester is the league creator
  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select("creator_id")
    .eq("id", leagueId)
    .single();

  if (leagueError || !league) {
    return Response.json({ error: "League not found" }, { status: 404 });
  }

  if (league.creator_id !== user.id) {
    return Response.json({ error: "Forbidden: only the league creator can manage transfer windows" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const closesAt =
    action === "open"
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : now;

  // Check if a manually triggered window already exists for this round
  const { data: existing } = await supabase
    .from("transfer_windows")
    .select("id")
    .eq("round_id", roundId)
    .eq("manually_triggered", true)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("transfer_windows")
      .update({ opens_at: now, closes_at: closesAt })
      .eq("id", existing.id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("transfer_windows").insert({
      round_id: roundId,
      window_number: 99,
      opens_at: now,
      closes_at: closesAt,
      manually_triggered: true,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ success: true, action }, { status: 200 });
}
