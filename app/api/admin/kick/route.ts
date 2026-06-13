import { createClient } from "@/lib/supabase/server";

interface KickBody {
  user_id: string;
  league_id: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: KickBody;
  try {
    body = (await request.json()) as KickBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { user_id: targetUserId, league_id: leagueId } = body;

  if (!targetUserId || !leagueId) {
    return Response.json({ error: "user_id and league_id are required" }, { status: 400 });
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
    return Response.json({ error: "Forbidden: only the league creator can kick members" }, { status: 403 });
  }

  // Cannot kick yourself
  if (targetUserId === user.id) {
    return Response.json({ error: "Cannot kick yourself" }, { status: 400 });
  }

  const { error } = await supabase
    .from("league_members")
    .delete()
    .eq("league_id", leagueId)
    .eq("user_id", targetUserId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true }, { status: 200 });
}
