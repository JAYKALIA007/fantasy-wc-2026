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

export interface CheckpointPhase {
  phase: string;
  status: string;
  actual_home: number | null;
  actual_away: number | null;
}

export interface CheckpointPick {
  phase: string;
  predicted_home: number;
  predicted_away: number;
  points: number | null;
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

  const MATCH_SELECT = `id, kickoff_time, home_score, away_score, status, group_label, venue_city, venue_name, allow_late_predictions, prediction_deadline,
       home_nation:home_nation_id(id, name, flag_code, fifa_ranking),
       away_nation:away_nation_id(id, name, flag_code, fifa_ranking),
       round:round_id(id, name)`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapMatch = (m: any): Match => ({
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
    home_nation: Array.isArray(m.home_nation) ? (m.home_nation[0] as Nation) : (m.home_nation as Nation),
    away_nation: Array.isArray(m.away_nation) ? (m.away_nation[0] as Nation) : (m.away_nation as Nation),
    round: Array.isArray(m.round)
      ? (m.round[0] as { id: string; name: string } | null)
      : (m.round as { id: string; name: string } | null),
  });

  const { data: matchesRaw } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .or(`and(status.eq.scheduled,kickoff_time.gt.${now},kickoff_time.lte.${cutoff}),and(allow_late_predictions.eq.true,prediction_deadline.gt.${now},status.neq.finished)`)
    .order("kickoff_time", { ascending: true });

  let matches: Match[] = (matchesRaw ?? []).map(mapMatch);

  // Keep IN-PROGRESS knockout matches visible: a match that has kicked off but
  // still has an open checkpoint window (h2 / et / pens) must stay on /predict so
  // players can act on it. Only past-kickoff matches qualify — upcoming matches
  // (which all have open h1/h2 now) are governed by the window + cap below.
  const visibleIds = new Set(matches.map((m) => m.id));
  const { data: openPhaseRows } = await supabase
    .from("match_checkpoint_phases")
    .select("match_id")
    .eq("status", "open");
  const liveMatchIds = [...new Set((openPhaseRows ?? []).map((r) => r.match_id as number))].filter(
    (id) => !visibleIds.has(id)
  );
  if (liveMatchIds.length > 0) {
    const { data: liveMatchesRaw } = await supabase
      .from("matches")
      .select(MATCH_SELECT)
      .in("id", liveMatchIds)
      .neq("status", "finished")
      .lt("kickoff_time", now);
    for (const m of liveMatchesRaw ?? []) matches.push(mapMatch(m));
    matches.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());
  }

  // Show at most the next 4 matches at a time (live ones sort first, so they're
  // always included), rather than dumping all 16 RO32 fixtures at once.
  const MAX_PREDICT_MATCHES = 4;
  matches = matches.slice(0, MAX_PREDICT_MATCHES);

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

  // Fetch open checkpoint phases for the visible knockout matches
  const knockoutMatchIds = matches
    .filter((m) => m.round && m.round.id !== "a0000000-0000-0000-0000-000000000001")
    .map((m) => m.id);

  type RawPhase = { match_id: number; phase: string; status: string; actual_home: number | null; actual_away: number | null };
  type RawPick  = { match_id: number; phase: string; predicted_home: number; predicted_away: number; points: number | null };

  let checkpointPhases: RawPhase[] = [];
  let myCheckpointPicks: RawPick[] = [];

  if (knockoutMatchIds.length > 0) {
    const [phasesRes, picksRes] = await Promise.all([
      supabase
        .from("match_checkpoint_phases")
        .select("match_id, phase, status, actual_home, actual_away")
        .in("match_id", knockoutMatchIds),
      supabase
        .from("live_checkpoint_predictions")
        .select("match_id, phase, predicted_home, predicted_away, points")
        .eq("user_id", user.id)
        .in("match_id", knockoutMatchIds),
    ]);
    checkpointPhases = (phasesRes.data ?? []) as RawPhase[];
    myCheckpointPicks = (picksRes.data ?? []) as RawPick[];
  }

  // Group by match_id
  const phasesByMatch = new Map<number, CheckpointPhase[]>();
  for (const p of checkpointPhases) {
    const arr = phasesByMatch.get(p.match_id) ?? [];
    arr.push({ phase: p.phase, status: p.status, actual_home: p.actual_home, actual_away: p.actual_away });
    phasesByMatch.set(p.match_id, arr);
  }
  const picksByMatch = new Map<number, CheckpointPick[]>();
  for (const p of myCheckpointPicks) {
    const arr = picksByMatch.get(p.match_id) ?? [];
    arr.push({ phase: p.phase, predicted_home: p.predicted_home, predicted_away: p.predicted_away, points: p.points });
    picksByMatch.set(p.match_id, arr);
  }

  const roundName = matches[0]?.round?.name ?? "Round of 16";

  const roundLabels: Record<string, string> = {
    group_stage: "Group Stage",
    ro32: "Round of 32",
    r16: "Round of 16",
    qf: "Quarter Finals",
    sf: "Semi Finals",
    bronze: "Bronze Final",
    final: "Final",
  };

  return (
    <PredictClient
      matches={matches}
      existingPredictions={existingPredictions}
      leagueId={membership.league_id as string}
      roundLabel={roundLabels[roundName] ?? roundName}
      nextUnlockLabel={nextUnlockLabel}
      checkpointPhasesByMatch={Object.fromEntries(phasesByMatch)}
      checkpointPicksByMatch={Object.fromEntries(picksByMatch)}
    />
  );
}
