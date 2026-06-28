import { createClient } from "@/lib/supabase/server";
import { computeLeaderboard, type LeaderboardRow } from "@/lib/server/leaderboard";

export interface LeaderboardApiRow extends LeaderboardRow {
  primary_nation_name: string;
}

// Short-lived in-memory cache, keyed by league + round. Under realtime fan-out
// many viewers refetch within the same instant after a score write; without this
// each request runs computeLeaderboard (~10 Supabase queries) independently. A
// few seconds of shared caching collapses that burst into one computation that
// every concurrent viewer reuses — the result is at most CACHE_TTL_MS stale,
// which is invisible on a leaderboard. (Per-instance under Fluid; still cuts
// load proportionally across warm instances.)
const CACHE_TTL_MS = 5000;
const leaderboardCache = new Map<string, { rows: LeaderboardApiRow[]; expires: number }>();

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  // No round_id → cumulative across all rounds; a round_id scopes to that round.
  const roundId = searchParams.get("round_id");

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

  // Access control (auth + league membership) is verified above on every request
  // and is never cached; only the expensive computed payload below is shared.
  const cacheKey = `${leagueId}:${roundId ?? "all"}`;
  const cached = leaderboardCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return Response.json({ rows: cached.rows });
  }

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

  leaderboardCache.set(cacheKey, { rows, expires: Date.now() + CACHE_TTL_MS });

  return Response.json({ rows });
}
