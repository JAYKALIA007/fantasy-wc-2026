import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HistoryClient, { type PredictionRecord } from "@/app/(app)/predict/history/history-client";

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
    .select("id, profile_name, primary_nation_id, secondary_nation_id")
    .eq("user_id", targetUserId)
    .eq("league_id", leagueId)
    .maybeSingle();

  if (!targetMember) notFound();

  const profileName = targetMember.profile_name as string;
  const memberId = targetMember.id as string;
  const now = new Date().toISOString();

  // Fetch nation bonus total for this member
  const { data: nationBonusRows } = await supabase
    .from("nation_bonus_points")
    .select("points")
    .eq("league_member_id", memberId);

  const nationBonus = (nationBonusRows ?? []).reduce((sum, r) => sum + (r.points as number), 0);

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

  type NationInfo = { name: string; flag_code: string };
  type MatchRaw = {
    kickoff_time: string;
    home_score: number | null;
    away_score: number | null;
    status: string;
    group_label: string | null;
    home_nation: NationInfo | NationInfo[];
    away_nation: NationInfo | NationInfo[];
  };

  const predictions: PredictionRecord[] = (predsRaw ?? [])
    .map((p) => {
      const matchRaw = Array.isArray(p.match) ? p.match[0] : p.match;
      if (!matchRaw) return null;
      const m = matchRaw as MatchRaw;
      // Only show predictions for matches that have already kicked off
      if (new Date(m.kickoff_time) > new Date(now)) return null;
      return {
        id: p.id as string,
        match_id: p.match_id as number,
        predicted_home_score: p.predicted_home_score as number,
        predicted_away_score: p.predicted_away_score as number,
        points: p.points as number | null,
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

  // Finished first (newest first), in-progress second (oldest first)
  const finished = predictions
    .filter((p) => p.match.status === "finished")
    .sort((a, b) => new Date(b.match.kickoff_time).getTime() - new Date(a.match.kickoff_time).getTime());

  const inProgress = predictions
    .filter((p) => p.match.status !== "finished")
    .sort((a, b) => new Date(a.match.kickoff_time).getTime() - new Date(b.match.kickoff_time).getTime());

  const sorted = [...finished, ...inProgress];

  return (
    <HistoryClient
      predictions={sorted}
      profileName={profileName}
      backHref="/ranks"
      nationBonus={nationBonus}
    />
  );
}
