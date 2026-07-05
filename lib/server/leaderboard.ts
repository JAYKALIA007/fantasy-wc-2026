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
  live_checkpoint_points: number;
  primary_nation_id: number | null;
  joined_at: string;
  finished_prediction_count: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

// Supabase/PostgREST caps every response at the project's "Max rows" setting
// (default 1000). Any table that grows past it is SILENTLY truncated — the
// finished-predictions read crossed 1000 mid-tournament and started dropping
// rows, under-counting whoever's rows landed in the tail. fetchAll pages through
// with .range() until a short page, so the total always reflects every row.
// PAGE_SIZE must be ≤ the "Max rows" setting for the short-page stop to be valid.
const PAGE_SIZE = 1000;

async function fetchAll<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeQuery: () => any
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

// roundId null = cumulative total across ALL rounds (tournament-long total).
// Pass a specific round id to scope EVERY component (predictions, nation bonus,
// live checkpoints, progression, swap penalties) to that round — a true
// per-round standing.
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

  const hasMembers = memberIds.length > 0;
  const emptyArr = <T,>() => Promise.resolve([] as T[]);

  // Every read below is paged through fetchAll so none can be truncated at the
  // "Max rows" cap. Progression + swap penalties are EXCLUDED from per-round
  // views: a "reach-X" milestone and the redraft cost are both banked BETWEEN
  // rounds (against picks/holdings before the round kicks off), so they belong
  // to no single round's "points earned this round" total — only the cumulative
  // (roundId === null) Overall standing.
  const [predictionRows, bonusRows, progressionRows, penaltyRows, holdingRows, liveRows] = await Promise.all([
    // Predictions — scoped by the match's round.
    fetchAll<{ user_id: string; points: number | null }>(() => {
      let q = supabase
        .from("predictions")
        .select("user_id, points, matches!inner(status, round_id)")
        .eq("league_id", leagueId)
        .eq("matches.status", "finished");
      if (roundId) q = q.eq("matches.round_id", roundId);
      return q;
    }),
    // Nation bonus — scoped by the match's round.
    hasMembers
      ? fetchAll<{ league_member_id: string; points: number }>(() => {
          let q = supabase
            .from("nation_bonus_points")
            .select("league_member_id, points, matches!inner(status, round_id)")
            .in("league_member_id", memberIds)
            .eq("matches.status", "finished");
          if (roundId) q = q.eq("matches.round_id", roundId);
          return q;
        })
      : emptyArr<{ league_member_id: string; points: number }>(),
    hasMembers && !roundId
      ? fetchAll<{ league_member_id: string; points: number }>(() =>
          supabase
            .from("progression_bonus_points")
            .select("league_member_id, points")
            .in("league_member_id", memberIds)
        )
      : emptyArr<{ league_member_id: string; points: number }>(),
    hasMembers && !roundId
      ? fetchAll<{ league_member_id: string; amount: number }>(() =>
          supabase
            .from("swap_penalties")
            .select("league_member_id, amount")
            .in("league_member_id", memberIds)
        )
      : emptyArr<{ league_member_id: string; amount: number }>(),
    hasMembers
      ? fetchAll<HoldingRow & { league_member_id: string }>(() =>
          supabase
            .from("member_round_teams")
            .select("league_member_id, round_id, primary_nation_id, secondary_nation_id")
            .in("league_member_id", memberIds)
        )
      : emptyArr<HoldingRow & { league_member_id: string }>(),
    // Live checkpoints — scoped by the match's round (only join when scoping).
    hasMembers
      ? fetchAll<{ user_id: string; points: number }>(() =>
          roundId
            ? supabase
                .from("live_checkpoint_predictions")
                .select("user_id, points, matches!inner(round_id)")
                .eq("league_id", leagueId)
                .not("points", "is", null)
                .eq("matches.round_id", roundId)
            : supabase
                .from("live_checkpoint_predictions")
                .select("user_id, points")
                .eq("league_id", leagueId)
                .not("points", "is", null)
        )
      : emptyArr<{ user_id: string; points: number }>(),
  ]);

  // Held primary per member: the latest re-draft holding if any, else the group
  // pick. Drives the nation shown on the leaderboard so it reflects redrafted
  // teams. Keyed by round, so group-stage standings are unaffected.
  const holdingsByMember = new Map<string, HoldingRow[]>();
  for (const h of holdingRows) {
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

  const nationBonusByUser = sumByUser(bonusRows, "points");
  const progressionByUser = sumByUser(progressionRows, "points");
  const penaltyByUser = sumByUser(penaltyRows, "amount");

  // Live checkpoint points are keyed directly by user_id (not league_member_id)
  const liveCheckpointByUser = new Map<string, number>();
  for (const r of liveRows) {
    liveCheckpointByUser.set(r.user_id, (liveCheckpointByUser.get(r.user_id) ?? 0) + (r.points ?? 0));
  }

  const predictionPointsByUser = new Map<string, number>();
  const finishedPredCountByUser = new Map<string, number>();
  for (const p of predictionRows) {
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
    const liveCheckpointPoints = liveCheckpointByUser.get(userId) ?? 0;
    const heldPrimary = currentHolding(
      { primary_nation_id: member.primary_nation_id ?? null, secondary_nation_id: null },
      holdingsByMember.get(member.id) ?? []
    ).primary_nation_id;
    rows.push({
      user_id: userId,
      profile_name: member.profile_name,
      total_points: predictionPoints + nationBonus + progressionBonus - swapPenalty + liveCheckpointPoints,
      prediction_points: predictionPoints,
      nation_bonus: nationBonus,
      progression_bonus: progressionBonus,
      swap_penalty: swapPenalty,
      live_checkpoint_points: liveCheckpointPoints,
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
