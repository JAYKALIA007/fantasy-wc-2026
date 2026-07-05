import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HistoryClient, { type PredictionRecord } from "./history-client";
import type { NationRef } from "@/lib/types";

export default async function HistoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/join");
  }

  const { data: membership } = await supabase
    .from("league_members")
    .select("id, league_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/onboarding");
  }

  const leagueId = membership.league_id as string;
  const leagueMemberId = membership.id as string;

  const [predsResult, nationBonusResult, checkpointResult] = await Promise.all([
    supabase
      .from("predictions")
      .select(
        `id, match_id, predicted_home_score, predicted_away_score, points,
         match:match_id(kickoff_time, home_score, away_score, status, group_label,
           home_nation:home_nation_id(name, flag_code),
           away_nation:away_nation_id(name, flag_code))`
      )
      .eq("user_id", user.id)
      .eq("league_id", leagueId),
    supabase
      .from("nation_bonus_points")
      .select("match_id, points")
      .eq("league_member_id", leagueMemberId),
    // The user's own live-checkpoint picks (knockout matches only have these).
    supabase
      .from("live_checkpoint_predictions")
      .select("match_id, phase, predicted_home, predicted_away, points")
      .eq("user_id", user.id)
      .eq("league_id", leagueId),
  ]);

  const nationBonusByMatch = new Map<number, number>();
  for (const row of (nationBonusResult.data ?? [])) {
    const matchId = row.match_id as number;
    nationBonusByMatch.set(matchId, (nationBonusByMatch.get(matchId) ?? 0) + (row.points as number));
  }

  // Group the user's checkpoint picks by match, ordered h1 → h2 → et → pens.
  const PHASE_RANK: Record<string, number> = { h1: 0, h2: 1, et: 2, pens: 3 };
  type HistCheckpoint = { phase: string; predicted_home: number; predicted_away: number; points: number | null };
  const checkpointsByMatch = new Map<number, HistCheckpoint[]>();
  for (const c of (checkpointResult.data ?? [])) {
    const matchId = c.match_id as number;
    const arr = checkpointsByMatch.get(matchId) ?? [];
    arr.push({
      phase: c.phase as string,
      predicted_home: c.predicted_home as number,
      predicted_away: c.predicted_away as number,
      points: c.points as number | null,
    });
    checkpointsByMatch.set(matchId, arr);
  }
  for (const arr of checkpointsByMatch.values()) {
    arr.sort((a, b) => (PHASE_RANK[a.phase] ?? 9) - (PHASE_RANK[b.phase] ?? 9));
  }

  const predictions: PredictionRecord[] = (predsResult.data ?? []).map((p) => {
    const matchRaw = Array.isArray(p.match) ? p.match[0] : p.match;
    const m = matchRaw as {
      kickoff_time: string;
      home_score: number | null;
      away_score: number | null;
      status: string;
      group_label: string | null;
      home_nation: NationRef | NationRef[];
      away_nation: NationRef | NationRef[];
    };
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
  });

  // Knockout matches the user made checkpoint picks for but never a full-time
  // (main) prediction. History is built from main-prediction rows, so without
  // this those in-play-only entries silently vanish. Surface them with a null
  // main score so the match — and its checkpoint points — still show.
  const predictedMatchIds = new Set(predictions.map((p) => p.match_id));
  const checkpointOnlyIds = [...checkpointsByMatch.keys()].filter((id) => !predictedMatchIds.has(id));

  let checkpointOnlyRecords: PredictionRecord[] = [];
  if (checkpointOnlyIds.length > 0) {
    const { data: coMatches } = await supabase
      .from("matches")
      .select(
        `id, kickoff_time, home_score, away_score, status, group_label,
         home_nation:home_nation_id(name, flag_code),
         away_nation:away_nation_id(name, flag_code)`
      )
      .in("id", checkpointOnlyIds);
    checkpointOnlyRecords = (coMatches ?? []).map((m) => {
      const matchId = m.id as number;
      return {
        id: `cp-${matchId}`,
        match_id: matchId,
        predicted_home_score: null,
        predicted_away_score: null,
        points: null,
        nation_bonus: nationBonusByMatch.get(matchId) ?? null,
        checkpoints: checkpointsByMatch.get(matchId) ?? [],
        match: {
          kickoff_time: m.kickoff_time as string,
          home_score: m.home_score as number | null,
          away_score: m.away_score as number | null,
          status: m.status as string,
          group_label: m.group_label as string | null,
          home_nation: (Array.isArray(m.home_nation) ? m.home_nation[0] : m.home_nation) as NationRef,
          away_nation: (Array.isArray(m.away_nation) ? m.away_nation[0] : m.away_nation) as NationRef,
        },
      };
    });
  }

  const allRecords = [...predictions, ...checkpointOnlyRecords];

  const now = new Date();

  const isLive = (p: PredictionRecord) =>
    p.match.status !== "finished" && new Date(p.match.kickoff_time) < now;

  const live = allRecords.filter(isLive);
  const finished = allRecords
    .filter((p) => p.match.status === "finished")
    .sort((a, b) => new Date(b.match.kickoff_time).getTime() - new Date(a.match.kickoff_time).getTime());

  const sorted = [...live, ...finished];

  return <HistoryClient predictions={sorted} />;
}
