import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HistoryClient, { type PredictionRecord, type CheckpointRecord } from "@/app/(app)/predict/history/history-client";
import type { NationRef } from "@/lib/types";
import { computeLeaderboard } from "@/lib/server/leaderboard";
import { currentHolding, type HoldingRow } from "@/lib/server/holdings";

export default async function PlayerPredictionsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId: targetUserId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/join");

  // Get current user's league
  const { data: myMembership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!myMembership) redirect("/onboarding");

  const leagueId = myMembership.league_id as string;

  // Verify target user is in the same league and get their profile name + nation picks
  const { data: targetMember } = await supabase
    .from("league_members")
    .select(`id, profile_name, primary_nation_id, secondary_nation_id`)
    .eq("user_id", targetUserId)
    .eq("league_id", leagueId)
    .maybeSingle();

  if (!targetMember) notFound();

  const profileName = targetMember.profile_name as string;
  const memberId = targetMember.id as string;

  // Resolve the team(s) this player currently holds — their latest re-draft
  // holding if they have redrafted, else their group-stage pick.
  let held = {
    primary_nation_id: (targetMember.primary_nation_id as number | null) ?? null,
    secondary_nation_id: (targetMember.secondary_nation_id as number | null) ?? null,
  };
  const { data: targetHoldings } = await supabase
    .from("member_round_teams")
    .select("round_id, primary_nation_id, secondary_nation_id")
    .eq("league_member_id", memberId);
  held = currentHolding(held, (targetHoldings ?? []) as HoldingRow[]);

  const heldIds = [held.primary_nation_id, held.secondary_nation_id].filter(
    (id): id is number => id !== null
  );
  const heldNationMap = new Map<number, NationRef>();
  if (heldIds.length > 0) {
    const { data: heldNations } = await supabase
      .from("nations")
      .select("id, name, flag_code")
      .in("id", heldIds);
    for (const n of heldNations ?? []) {
      heldNationMap.set(n.id as number, { name: n.name as string, flag_code: n.flag_code as string });
    }
  }
  const primaryNation = held.primary_nation_id ? heldNationMap.get(held.primary_nation_id) ?? null : null;
  const secondaryNation = held.secondary_nation_id ? heldNationMap.get(held.secondary_nation_id) ?? null : null;
  const now = new Date().toISOString();

  // Fetch nation bonus (total + per-match) for this member
  const { data: nationBonusRows } = await supabase
    .from("nation_bonus_points")
    .select("match_id, points")
    .eq("league_member_id", memberId);

  const nationBonus = (nationBonusRows ?? []).reduce((sum, r) => sum + (r.points as number), 0);

  // Full points breakdown for this player (admin-excluded leaderboard math).
  const { data: leagueRow } = await supabase.from("leagues").select("creator_id").eq("id", leagueId).single();
  const leaderboardRows = await computeLeaderboard(supabase, leagueId, (leagueRow?.creator_id as string | null) ?? null, null);
  const targetRow = leaderboardRows.find((r) => r.user_id === targetUserId);
  const breakdown = targetRow
    ? {
        predictions: targetRow.prediction_points,
        nationBonus: targetRow.nation_bonus,
        progressionBonus: targetRow.progression_bonus,
        liveCheckpoint: targetRow.live_checkpoint_points,
        swapPenalty: targetRow.swap_penalty,
        total: targetRow.total_points,
      }
    : undefined;

  const nationBonusByMatch = new Map<number, number>();
  for (const row of (nationBonusRows ?? [])) {
    const mid = row.match_id as number;
    nationBonusByMatch.set(mid, (nationBonusByMatch.get(mid) ?? 0) + (row.points as number));
  }

  // Fetch all their predictions — filter to kicked-off matches in JS
  // (PostgREST does not support filtering a parent table by an embedded relation column)
  const { data: predsRaw } = await supabase
    .from("predictions")
    .select(
      `id, match_id, predicted_home_score, predicted_away_score, points,
       match:match_id(kickoff_time, home_score, away_score, status, group_label,
         home_nation:home_nation_id(name, flag_code),
         away_nation:away_nation_id(name, flag_code))`
    )
    .eq("user_id", targetUserId)
    .eq("league_id", leagueId);

  // This player's checkpoint picks. RLS only returns other players' picks for
  // phases whose window has CLOSED/SCORED, so live (open) picks stay hidden.
  const { data: cpRaw } = await supabase
    .from("live_checkpoint_predictions")
    .select("match_id, phase, predicted_home, predicted_away, points")
    .eq("user_id", targetUserId)
    .eq("league_id", leagueId);

  const PHASE_RANK: Record<string, number> = { h1: 0, h2: 1, et: 2, pens: 3 };
  const checkpointsByMatch = new Map<number, CheckpointRecord[]>();
  for (const c of (cpRaw ?? [])) {
    const mid = c.match_id as number;
    const arr = checkpointsByMatch.get(mid) ?? [];
    arr.push({
      phase: c.phase as string,
      predicted_home: c.predicted_home as number,
      predicted_away: c.predicted_away as number,
      points: c.points as number | null,
    });
    checkpointsByMatch.set(mid, arr);
  }
  for (const arr of checkpointsByMatch.values()) {
    arr.sort((a, b) => (PHASE_RANK[a.phase] ?? 9) - (PHASE_RANK[b.phase] ?? 9));
  }

  type MatchRaw = {
    kickoff_time: string;
    home_score: number | null;
    away_score: number | null;
    status: string;
    group_label: string | null;
    home_nation: NationRef | NationRef[];
    away_nation: NationRef | NationRef[];
  };

  const predictions: PredictionRecord[] = (predsRaw ?? [])
    .map((p): PredictionRecord | null => {
      const matchRaw = Array.isArray(p.match) ? p.match[0] : p.match;
      if (!matchRaw) return null;
      const m = matchRaw as MatchRaw;
      // Only show predictions for matches that have already kicked off
      if (new Date(m.kickoff_time) > new Date(now)) return null;
      const matchId = p.match_id as number;
      return {
        id: p.id as string,
        match_id: matchId,
        predicted_home_score: p.predicted_home_score as number,
        predicted_away_score: p.predicted_away_score as number,
        points: p.points as number | null,
        nation_bonus: nationBonusByMatch.get(matchId) ?? null,
        checkpoints: checkpointsByMatch.get(matchId) ?? [],
        match: {
          kickoff_time: m.kickoff_time,
          home_score: m.home_score,
          away_score: m.away_score,
          status: m.status,
          group_label: m.group_label,
          home_nation: Array.isArray(m.home_nation) ? m.home_nation[0] : m.home_nation,
          away_nation: Array.isArray(m.away_nation) ? m.away_nation[0] : m.away_nation,
        },
      };
    })
    .filter((p): p is PredictionRecord => p !== null);

  const nowDate = new Date();
  const isLive = (p: PredictionRecord) =>
    p.match.status !== "finished" && new Date(p.match.kickoff_time) < nowDate;

  const live = predictions.filter(isLive);
  const finished = predictions
    .filter((p) => p.match.status === "finished")
    .sort((a, b) => new Date(b.match.kickoff_time).getTime() - new Date(a.match.kickoff_time).getTime());

  const sorted = [...live, ...finished];

  return (
    <HistoryClient
      predictions={sorted}
      profileName={profileName}
      backHref="/ranks"
      nationBonus={nationBonus}
      primaryNation={primaryNation ?? undefined}
      secondaryNation={secondaryNation ?? undefined}
      breakdown={breakdown}
    />
  );
}
