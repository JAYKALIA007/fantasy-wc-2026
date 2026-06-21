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

  const [predsResult, nationBonusResult] = await Promise.all([
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
  ]);

  const nationBonusByMatch = new Map<number, number>();
  for (const row of (nationBonusResult.data ?? [])) {
    const matchId = row.match_id as number;
    nationBonusByMatch.set(matchId, (nationBonusByMatch.get(matchId) ?? 0) + (row.points as number));
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

  const now = new Date();

  const isLive = (p: PredictionRecord) =>
    p.match.status !== "finished" && new Date(p.match.kickoff_time) < now;

  const live = predictions.filter(isLive);
  const finished = predictions
    .filter((p) => p.match.status === "finished")
    .sort((a, b) => new Date(b.match.kickoff_time).getTime() - new Date(a.match.kickoff_time).getTime());

  const sorted = [...live, ...finished];

  return <HistoryClient predictions={sorted} />;
}
