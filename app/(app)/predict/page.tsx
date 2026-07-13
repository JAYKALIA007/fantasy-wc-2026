import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PredictClient from "./predict-client";
import type { Nation } from "@/lib/types";
import { ROUND_IDS } from "@/lib/constants";
import { computeLeaderboard } from "@/lib/server/leaderboard";

// Goalscorer wager is offered on the 4 remaining knockout fixtures only.
const WAGER_ROUND_IDS: string[] = [ROUND_IDS.sf, ROUND_IDS.final, ROUND_IDS.bronze];

export interface WagerPlayer {
  id: number;
  name: string;
  position: string;
}
export interface RevealPick {
  match_id: number;
  player_id: number;
  player_name: string;
  member_name: string;
  is_me: boolean;
  status: string;
}

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

  const now = new Date().toISOString();

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
    .or(`and(status.eq.scheduled,kickoff_time.gt.${now}),and(allow_late_predictions.eq.true,prediction_deadline.gt.${now},status.neq.finished)`)
    .order("kickoff_time", { ascending: true })
    .limit(20);

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

  // ── Goalscorer wager data (only for the 4 remaining knockout fixtures) ──
  const eligibleMatches = matches.filter((m) => m.round && WAGER_ROUND_IDS.includes(m.round.id));
  const rostersByMatch: Record<number, { home: WagerPlayer[]; away: WagerPlayer[] }> = {};
  const wagersByMatch: Record<number, { player_id: number; status: string }[]> = {};
  const revealByMatch: Record<number, RevealPick[]> = {};
  let wagerAvailable = 0;

  if (eligibleMatches.length > 0) {
    const eligibleIds = eligibleMatches.map((m) => m.id);
    const nationIds = [...new Set(eligibleMatches.flatMap((m) => [m.home_nation.id, m.away_nation.id]))];

    // Rosters (from the seeded football_players — ESPN-sourced names).
    const { data: playersRaw } = await supabase
      .from("football_players")
      .select("id, name, position, nation_id")
      .in("nation_id", nationIds);
    const POS_ORDER: Record<string, number> = { fwd: 0, mid: 1, def: 2, gk: 3 };
    const byNation = new Map<number, WagerPlayer[]>();
    for (const p of playersRaw ?? []) {
      const arr = byNation.get(p.nation_id as number) ?? [];
      arr.push({ id: p.id as number, name: p.name as string, position: p.position as string });
      byNation.set(p.nation_id as number, arr);
    }
    const sortRoster = (arr: WagerPlayer[]) =>
      [...arr].sort((a, b) => (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9) || a.name.localeCompare(b.name));
    for (const m of eligibleMatches) {
      rostersByMatch[m.id] = {
        home: sortRoster(byNation.get(m.home_nation.id) ?? []),
        away: sortRoster(byNation.get(m.away_nation.id) ?? []),
      };
    }

    // This user's own wagers on these matches.
    const { data: myWagersRaw } = await supabase
      .from("goalscorer_wagers")
      .select("match_id, player_id, status")
      .eq("league_id", membership.league_id)
      .eq("user_id", user.id)
      .in("match_id", eligibleIds);
    for (const w of myWagersRaw ?? []) {
      const arr = wagersByMatch[w.match_id as number] ?? [];
      arr.push({ player_id: w.player_id as number, status: w.status as string });
      wagersByMatch[w.match_id as number] = arr;
    }

    // Reveal-at-lock: everyone's picks become visible once a match kicks off.
    const lockedIds = eligibleMatches
      .filter((m) => new Date() >= new Date(m.kickoff_time))
      .map((m) => m.id);
    if (lockedIds.length > 0) {
      const [{ data: allWagersRaw }, { data: membersRaw }, { data: leagueRow }] = await Promise.all([
        supabase
          .from("goalscorer_wagers")
          .select("match_id, player_id, espn_name, status, user_id")
          .in("match_id", lockedIds),
        supabase.from("league_members").select("user_id, profile_name").eq("league_id", membership.league_id),
        supabase.from("leagues").select("creator_id").eq("id", membership.league_id).single(),
      ]);
      const adminId = (leagueRow?.creator_id as string | null) ?? null;
      const nameByUser = new Map<string, string>();
      for (const mem of membersRaw ?? []) nameByUser.set(mem.user_id as string, mem.profile_name as string);
      for (const w of allWagersRaw ?? []) {
        const uid = w.user_id as string;
        if (uid === adminId) continue; // admin excluded, like the leaderboard/bracket
        const arr = revealByMatch[w.match_id as number] ?? [];
        arr.push({
          match_id: w.match_id as number,
          player_id: w.player_id as number,
          player_name: w.espn_name as string,
          member_name: nameByUser.get(uid) ?? "—",
          is_me: uid === user.id,
          status: w.status as string,
        });
        revealByMatch[w.match_id as number] = arr;
      }
      for (const arr of Object.values(revealByMatch)) {
        arr.sort((a, b) => (a.is_me === b.is_me ? a.member_name.localeCompare(b.member_name) : a.is_me ? -1 : 1));
      }
    }

    // Balance for the gate: bankroll (non-wager base + settled wager net) − 10×pending.
    const { data: leagueRow2 } = await supabase.from("leagues").select("creator_id").eq("id", membership.league_id).single();
    const lbRows = await computeLeaderboard(supabase, membership.league_id as string, (leagueRow2?.creator_id as string | null) ?? null, null);
    const me = lbRows.find((r) => r.user_id === user.id);
    const base = (me?.total_points ?? 0) - (me?.wager_points ?? 0);
    const { data: allMyWagers } = await supabase
      .from("goalscorer_wagers")
      .select("status")
      .eq("league_id", membership.league_id)
      .eq("user_id", user.id);
    let settledNet = 0;
    let pending = 0;
    for (const w of allMyWagers ?? []) {
      if (w.status === "won") settledNet += 5;
      else if (w.status === "lost") settledNet -= 10;
      else pending += 1;
    }
    wagerAvailable = base + settledNet - 10 * pending;
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
      checkpointPhasesByMatch={Object.fromEntries(phasesByMatch)}
      checkpointPicksByMatch={Object.fromEntries(picksByMatch)}
      rostersByMatch={rostersByMatch}
      wagersByMatch={wagersByMatch}
      revealByMatch={revealByMatch}
      wagerAvailable={wagerAvailable}
    />
  );
}
