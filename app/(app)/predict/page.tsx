import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PredictClient from "./predict-client";
import type { Nation } from "@/lib/types";

interface Match {
  id: number;
  kickoff_time: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  group_label?: string | null;
  venue_city?: string | null;
  venue_name?: string | null;
  allow_late_predictions: boolean;
  prediction_deadline: string | null;
  home_nation: Nation;
  away_nation: Nation;
  round: { id: string; name: string } | null;
}

interface ExistingPrediction {
  match_id: number;
  predicted_home_score: number;
  predicted_away_score: number;
}

export default async function PredictPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/join");
  }

  // Get league membership
  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/onboarding");
  }

  // Cutoff = end of tomorrow IST (start of day after tomorrow in IST, converted to UTC)
  const now = new Date().toISOString();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + istOffsetMs);
  const cutoff = new Date(
    Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate() + 2, 0, 0, 0, 0) - istOffsetMs
  ).toISOString();

  // Label for next unlock (day after tomorrow in IST)
  const nextUnlockIST = new Date(new Date(cutoff).getTime() + istOffsetMs);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const nextUnlockLabel = `${nextUnlockIST.getUTCDate()} ${months[nextUnlockIST.getUTCMonth()]}`;

  const { data: matchesRaw } = await supabase
    .from("matches")
    .select(
      `id, kickoff_time, home_score, away_score, status, group_label, venue_city, venue_name, allow_late_predictions, prediction_deadline,
       home_nation:home_nation_id(id, name, flag_code, fifa_ranking),
       away_nation:away_nation_id(id, name, flag_code, fifa_ranking),
       round:round_id(id, name)`
    )
    .or(`and(status.eq.scheduled,kickoff_time.gt.${now},kickoff_time.lte.${cutoff}),and(allow_late_predictions.eq.true,prediction_deadline.gt.${now},status.neq.finished)`)
    .order("kickoff_time", { ascending: true });

  const matches: Match[] = (matchesRaw ?? []).map((m) => ({
    id: m.id as number,
    kickoff_time: m.kickoff_time as string,
    home_score: m.home_score as number | null,
    away_score: m.away_score as number | null,
    status: m.status as string,
    group_label: m.group_label as string | null,
    venue_city: m.venue_city as string | null,
    venue_name: m.venue_name as string | null,
    allow_late_predictions: (m.allow_late_predictions as boolean) ?? false,
    prediction_deadline: (m.prediction_deadline as string | null) ?? null,
    home_nation: Array.isArray(m.home_nation)
      ? (m.home_nation[0] as Nation)
      : (m.home_nation as Nation),
    away_nation: Array.isArray(m.away_nation)
      ? (m.away_nation[0] as Nation)
      : (m.away_nation as Nation),
    round: Array.isArray(m.round)
      ? (m.round[0] as { id: string; name: string } | null)
      : (m.round as { id: string; name: string } | null),
  }));

  // Fetch existing predictions for these matches
  const matchIds = matches.map((m) => m.id);
  let existingPredictions: ExistingPrediction[] = [];

  if (matchIds.length > 0) {
    const { data: predsRaw } = await supabase
      .from("predictions")
      .select("match_id, predicted_home_score, predicted_away_score")
      .eq("user_id", user.id)
      .eq("league_id", membership.league_id)
      .in("match_id", matchIds);

    existingPredictions = (predsRaw ?? []) as ExistingPrediction[];
  }

  const roundName = matches[0]?.round?.name ?? "Round of 16";

  const roundLabels: Record<string, string> = {
    group_stage: "Group Stage",
    r32: "Round of 32",
    r16: "Round of 16",
    qf: "Quarter Finals",
    sf: "Semi Finals",
    final: "Final",
  };

  return (
    <PredictClient
      matches={matches}
      existingPredictions={existingPredictions}
      leagueId={membership.league_id as string}
      roundLabel={roundLabels[roundName] ?? roundName}
      nextUnlockLabel={nextUnlockLabel}
    />
  );
}
