import { ROUND_ID } from "@/lib/constants";
import { buildMemberMaps, type LeagueMemberRow } from "@/lib/server/members";
import { currentHolding, type HoldingRow } from "@/lib/server/holdings";

export interface LeaderboardRow {
  user_id: string;
  profile_name: string;
  total_points: number;
  prediction_points: number;
  nation_bonus: number;
  progression_bonus: number;
  swap_penalty: number;
  primary_nation_id: number | null;
  joined_at: string;
  finished_prediction_count: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

// roundId null = cumulative prediction points across ALL rounds (tournament-long
// total). Pass a specific round id to scope prediction points to that round.
export async function computeLeaderboard(
  supabase: SupabaseLike,
  leagueId: string,
  adminUserId: string | null,
  roundId: string | null = null
): Promise<LeaderboardRow[]> {
  const { data: allMembersRaw } = await supabase
    .from("league_members")
    .select("id, user_id, profile_name, primary_nation_id, joined_at")
    .eq("league_id", leagueId);

  const { memberIdToUserId, memberInfoByUserId, memberIds } = buildMemberMaps(
    (allMembersRaw ?? []) as LeagueMemberRow[],
    adminUserId
  );

  const emptyRows = Promise.resolve({ data: [] as { league_member_id: string; points: number }[] });
  const predictionsQuery = supabase
    .from("predictions")
    .select("user_id, points, matches!inner(status, round_id)")
    .eq("league_id", leagueId)
    .eq("matches.status", "finished");
  const emptyHoldings = Promise.resolve({
    data: [] as (HoldingRow & { league_member_id: string })[],
  });
  const [finishedPredsResult, bonusResult, progressionResult, penaltyResult, holdingsResult] = await Promise.all([
    roundId ? predictionsQuery.eq("matches.round_id", roundId) : predictionsQuery,
    memberIds.length > 0
      ? supabase
          .from("nation_bonus_points")
          .select("league_member_id, points, matches!inner(status)")
          .in("league_member_id", memberIds)
          .eq("matches.status", "finished")
      : emptyRows,
    memberIds.length > 0
      ? supabase.from("progression_bonus_points").select("league_member_id, points").in("league_member_id", memberIds)
      : emptyRows,
    memberIds.length > 0
      ? supabase.from("swap_penalties").select("league_member_id, amount").in("league_member_id", memberIds)
      : Promise.resolve({ data: [] as { league_member_id: string; amount: number }[] }),
    memberIds.length > 0
      ? supabase
          .from("member_round_teams")
          .select("league_member_id, round_id, primary_nation_id, secondary_nation_id")
          .in("league_member_id", memberIds)
      : emptyHoldings,
  ]);

  // Held primary per member: the latest re-draft holding if any, else the group
  // pick. Drives the nation shown on the leaderboard so it reflects redrafted
  // teams. Keyed by round, so group-stage standings are unaffected.
  const holdingsByMember = new Map<string, HoldingRow[]>();
  for (const h of (holdingsResult.data ?? []) as (HoldingRow & { league_member_id: string })[]) {
    const arr = holdingsByMember.get(h.league_member_id) ?? [];
    arr.push({ round_id: h.round_id, primary_nation_id: h.primary_nation_id, secondary_nation_id: h.secondary_nation_id });
    holdingsByMember.set(h.league_member_id, arr);
  }

  // Sum a league_member_id-keyed points table into a user_id-keyed map.
  const sumByUser = (
    data: { league_member_id: string; points?: number; amount?: number }[] | null,
    field: "points" | "amount"
  ) => {
    const out = new Map<string, number>();
    for (const r of data ?? []) {
      const uid = memberIdToUserId.get(r.league_member_id as string);
      if (uid) out.set(uid, (out.get(uid) ?? 0) + ((r[field] as number) ?? 0));
    }
    return out;
  };

  const nationBonusByUser = sumByUser(bonusResult.data, "points");
  const progressionByUser = sumByUser(progressionResult.data, "points");
  const penaltyByUser = sumByUser(penaltyResult.data, "amount");

  const predictionPointsByUser = new Map<string, number>();
  const finishedPredCountByUser = new Map<string, number>();
  for (const p of (finishedPredsResult.data ?? []) as { user_id: string; points: number | null }[]) {
    const uid = p.user_id;
    predictionPointsByUser.set(uid, (predictionPointsByUser.get(uid) ?? 0) + (p.points ?? 0));
    finishedPredCountByUser.set(uid, (finishedPredCountByUser.get(uid) ?? 0) + 1);
  }

  const rows: LeaderboardRow[] = [];
  for (const [userId, member] of memberInfoByUserId.entries()) {
    const predictionPoints = predictionPointsByUser.get(userId) ?? 0;
    const nationBonus = nationBonusByUser.get(userId) ?? 0;
    const progressionBonus = progressionByUser.get(userId) ?? 0;
    const swapPenalty = penaltyByUser.get(userId) ?? 0;
    const heldPrimary = currentHolding(
      { primary_nation_id: member.primary_nation_id ?? null, secondary_nation_id: null },
      holdingsByMember.get(member.id) ?? []
    ).primary_nation_id;
    rows.push({
      user_id: userId,
      profile_name: member.profile_name,
      total_points: predictionPoints + nationBonus + progressionBonus - swapPenalty,
      prediction_points: predictionPoints,
      nation_bonus: nationBonus,
      progression_bonus: progressionBonus,
      swap_penalty: swapPenalty,
      primary_nation_id: heldPrimary,
      joined_at: member.joined_at,
      finished_prediction_count: finishedPredCountByUser.get(userId) ?? 0,
    });
  }

  rows.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (a.finished_prediction_count !== b.finished_prediction_count) return a.finished_prediction_count - b.finished_prediction_count;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });

  return rows;
}
