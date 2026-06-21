import { ROUND_ID } from "@/lib/constants";

export interface LeaderboardRow {
  user_id: string;
  profile_name: string;
  total_points: number;
  prediction_points: number;
  nation_bonus: number;
  primary_nation_id: number | null;
  joined_at: string;
  finished_prediction_count: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

export async function computeLeaderboard(
  supabase: SupabaseLike,
  leagueId: string,
  adminUserId: string | null,
  roundId: string = ROUND_ID
): Promise<LeaderboardRow[]> {
  const { data: allMembersRaw } = await supabase
    .from("league_members")
    .select("id, user_id, profile_name, primary_nation_id, joined_at")
    .eq("league_id", leagueId);

  const allMembers = (allMembersRaw ?? []).filter(
    (m: { user_id: string }) => m.user_id !== adminUserId
  );

  const memberIdToUserId = new Map<string, string>();
  const memberInfoMap = new Map<string, { profile_name: string; primary_nation_id: number | null; joined_at: string }>();
  for (const m of allMembers) {
    memberIdToUserId.set(m.id as string, m.user_id as string);
    memberInfoMap.set(m.user_id as string, {
      profile_name: m.profile_name as string,
      primary_nation_id: m.primary_nation_id as number | null,
      joined_at: m.joined_at as string,
    });
  }

  const memberIds = Array.from(memberIdToUserId.keys());

  const [scoresResult, bonusResult, finishedPredsResult] = await Promise.all([
    supabase
      .from("prediction_round_scores")
      .select("user_id, total_points")
      .eq("league_id", leagueId)
      .eq("round_id", roundId),
    memberIds.length > 0
      ? supabase.from("nation_bonus_points").select("league_member_id, points").in("league_member_id", memberIds)
      : Promise.resolve({ data: [] as { league_member_id: string; points: number }[] }),
    supabase
      .from("predictions")
      .select("user_id, match_id, matches!inner(status)")
      .eq("league_id", leagueId)
      .eq("matches.status", "finished"),
  ]);

  const nationBonusByUser = new Map<string, number>();
  for (const nb of (bonusResult.data ?? [])) {
    const uid = memberIdToUserId.get(nb.league_member_id as string);
    if (uid) nationBonusByUser.set(uid, (nationBonusByUser.get(uid) ?? 0) + (nb.points as number));
  }

  const finishedPredCountByUser = new Map<string, number>();
  for (const p of (finishedPredsResult.data ?? []) as { user_id: string }[]) {
    finishedPredCountByUser.set(p.user_id, (finishedPredCountByUser.get(p.user_id) ?? 0) + 1);
  }

  const rows: LeaderboardRow[] = [];
  const seenUserIds = new Set<string>();

  for (const s of (scoresResult.data ?? [])) {
    const userId = s.user_id as string;
    const member = memberInfoMap.get(userId);
    if (!member) continue;
    seenUserIds.add(userId);
    const predictionPoints = s.total_points as number;
    const nationBonus = nationBonusByUser.get(userId) ?? 0;
    rows.push({
      user_id: userId,
      profile_name: member.profile_name,
      total_points: predictionPoints + nationBonus,
      prediction_points: predictionPoints,
      nation_bonus: nationBonus,
      primary_nation_id: member.primary_nation_id,
      joined_at: member.joined_at,
      finished_prediction_count: finishedPredCountByUser.get(userId) ?? 0,
    });
  }

  // Include members with no prediction scores yet
  for (const [userId, member] of memberInfoMap.entries()) {
    if (!seenUserIds.has(userId)) {
      const nationBonus = nationBonusByUser.get(userId) ?? 0;
      rows.push({
        user_id: userId,
        profile_name: member.profile_name,
        total_points: nationBonus,
        prediction_points: 0,
        nation_bonus: nationBonus,
        primary_nation_id: member.primary_nation_id,
        joined_at: member.joined_at,
        finished_prediction_count: finishedPredCountByUser.get(userId) ?? 0,
      });
    }
  }

  rows.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (a.finished_prediction_count !== b.finished_prediction_count) return a.finished_prediction_count - b.finished_prediction_count;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });

  return rows;
}
