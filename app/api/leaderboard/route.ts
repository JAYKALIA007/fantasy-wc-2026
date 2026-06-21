import { createClient } from "@/lib/supabase/server";
import { ROUND_ID } from "@/lib/constants";
import { computeLeaderboard, type LeaderboardRow } from "@/lib/server/leaderboard";

export interface LeaderboardApiRow extends LeaderboardRow {
  primary_nation_name: string;
}

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const roundId = searchParams.get("round_id") ?? ROUND_ID;

  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return Response.json({ error: "Not in a league" }, { status: 403 });
  }

  const leagueId = membership.league_id as string;

  const { data: league } = await supabase
    .from("leagues")
    .select("creator_id")
    .eq("id", leagueId)
    .single();

  const adminUserId = (league?.creator_id as string | null) ?? null;
  const rankRows = await computeLeaderboard(supabase, leagueId, adminUserId, roundId);

  const nationIds = Array.from(
    new Set(rankRows.map((r) => r.primary_nation_id).filter((id): id is number => id !== null))
  );
  const nationNameMap = new Map<number, string>();
  if (nationIds.length > 0) {
    const { data: nationsData } = await supabase
      .from("nations")
      .select("id, name")
      .in("id", nationIds);
    for (const n of nationsData ?? []) {
      nationNameMap.set(n.id as number, n.name as string);
    }
  }

  const rows: LeaderboardApiRow[] = rankRows.map((r) => ({
    ...r,
    primary_nation_name:
      r.primary_nation_id !== null ? (nationNameMap.get(r.primary_nation_id) ?? "") : "",
  }));

  return Response.json({ rows });
}
