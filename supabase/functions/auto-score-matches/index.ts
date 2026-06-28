import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ESPN name overrides — ESPN's displayName matches our DB name for every current
// team, verified against the fifa.world scoreboard API (June 2026), including the
// RO32 teams Congo DR, Bosnia-Herzegovina and Cape Verde. No overrides are needed;
// the previous "Congo DR"→"DR Congo" entry was incorrect and broke matching.
const ESPN_NAME_MAP: Record<string, string> = {};

function toEspnName(name: string): string {
  return ESPN_NAME_MAP[name] ?? name;
}

// Knockout rounds get live in-play checkpoint windows. Round-agnostic: adding a
// later round here (or just having its matches exist) activates checkpoints for it.
const KNOCKOUT_ROUND_IDS = [
  "a0000000-0000-0000-0000-000000000003", // ro32
  "a0000000-0000-0000-0000-000000000002", // r16
  "a0000000-0000-0000-0000-000000000004", // qf
  "a0000000-0000-0000-0000-000000000005", // sf
  "a0000000-0000-0000-0000-000000000006", // final
  "a0000000-0000-0000-0000-000000000008", // bronze
];

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fantasy-wc-2026-ashy.vercel.app";

interface Nation {
  name: string;
}

interface Match {
  id: number;
  kickoff_time: string;
  round_id: string;
  home_nation_id: number | null;
  away_nation_id: number | null;
  home_nation: Nation | Nation[] | null;
  away_nation: Nation | Nation[] | null;
}

interface EspnCompetitor {
  team: { displayName: string; shortDisplayName: string };
  homeAway: string;
  score: string;
  shootoutScore?: number | null;
}

interface EspnEvent {
  competitions: Array<{
    competitors: EspnCompetitor[];
    status: { type: { state?: string; completed: boolean; description?: string; detail?: string; shortDetail?: string }; period?: number | null };
  }>;
}

function toDateStr(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Per-run cache so each unique match-date is fetched from ESPN at most once,
// shared across the final-score and checkpoint passes.
const eventCache = new Map<string, EspnEvent[]>();
async function getEvents(dateStr: string): Promise<EspnEvent[]> {
  if (eventCache.has(dateStr)) return eventCache.get(dateStr)!;
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateStr}`;
  let events: EspnEvent[] = [];
  try {
    const res = await fetch(url, { headers: { "User-Agent": "fantasy-wc-2026/1.0" } });
    if (res.ok) {
      const data = (await res.json()) as { events?: EspnEvent[] };
      events = data.events ?? [];
    }
  } catch {
    events = [];
  }
  eventCache.set(dateStr, events);
  return events;
}

function datesToTry(kickoff: string): string[] {
  const d = new Date(kickoff);
  return [toDateStr(d), toDateStr(new Date(d.getTime() - 24 * 60 * 60 * 1000))];
}

function matchCompetitor(c: EspnCompetitor, target: string): boolean {
  const name = (c.team.displayName ?? c.team.shortDisplayName ?? "").toLowerCase();
  return name.includes(target) || target.includes(name);
}

// Returns the ESPN competition (with status + competitors) for the given pairing,
// regardless of completion — needed to read in-play phase, not just final score.
function findCompetition(events: EspnEvent[], espnHome: string, espnAway: string) {
  for (const event of events) {
    for (const competition of event.competitions ?? []) {
      const competitors = competition.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      if (!home || !away) continue;
      if (matchCompetitor(home, espnHome) && matchCompetitor(away, espnAway)) {
        return competition;
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic mirrored from lib/server/espnPhase.ts, checkpointPhases.ts and
// liveCheckpoint.ts (those are the canonical, Vitest-tested versions; this Deno
// copy must stay behaviourally identical). Keep changes in lockstep.
// ─────────────────────────────────────────────────────────────────────────────

type MatchStage = "pre" | "first_half" | "halftime" | "second_half" | "extra_time" | "shootout" | "complete";
type Phase = "h1" | "h2" | "et" | "pens";
type PhaseStatus = "pending" | "open" | "closed" | "scored";

interface DetectedState {
  stage: MatchStage;
  home: number;
  away: number;
  shootoutHome: number | null;
  shootoutAway: number | null;
  decidedInRegulation: boolean;
}

interface StoredPhase {
  phase: Phase;
  status: PhaseStatus;
}

interface PhaseAction {
  phase: Phase;
  status: PhaseStatus;
  actual_home?: number;
  actual_away?: number;
  opened?: boolean;
}

function hasKw(t: { description?: string; detail?: string; shortDetail?: string }, kw: string): boolean {
  const blob = `${t.description ?? ""} ${t.detail ?? ""} ${t.shortDetail ?? ""}`.toLowerCase();
  return blob.includes(kw);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEspnCompetition(comp: any): DetectedState | null {
  const competitors = comp.competitors ?? [];
  const home = competitors.find((c: EspnCompetitor) => c.homeAway === "home");
  const away = competitors.find((c: EspnCompetitor) => c.homeAway === "away");
  if (!home || !away) return null;
  const h = parseInt(home.score, 10);
  const a = parseInt(away.score, 10);
  if (isNaN(h) || isNaN(a)) return null;

  const shootoutHome = home.shootoutScore ?? null;
  const shootoutAway = away.shootoutScore ?? null;
  const type = comp.status?.type ?? {};
  const state = (type.state ?? "").toLowerCase();
  const completed = type.completed === true;
  const period = comp.status?.period ?? 0;

  let stage: MatchStage;
  let decidedInRegulation = false;

  if (state === "pre") {
    stage = "pre";
  } else if (completed || state === "post") {
    stage = "complete";
    decidedInRegulation = (period || 0) <= 2 && shootoutHome == null && shootoutAway == null;
  } else {
    if (hasKw(type, "halftime") || hasKw(type, "half-time") || hasKw(type, "half time")) {
      stage = "halftime";
    } else if (period >= 5 || hasKw(type, "shootout") || hasKw(type, "penalties")) {
      stage = "shootout";
    } else if (period === 3 || period === 4 || hasKw(type, "extra")) {
      stage = "extra_time";
    } else if (period === 2) {
      stage = "second_half";
    } else {
      stage = "first_half";
    }
  }

  return { stage, home: h, away: a, shootoutHome, shootoutAway, decidedInRegulation };
}

function computePhaseTransitions(stored: StoredPhase[], detected: DetectedState): PhaseAction[] {
  const byPhase = new Map<Phase, StoredPhase>();
  for (const s of stored) byPhase.set(s.phase, s);
  const statusOf = (p: Phase): PhaseStatus => byPhase.get(p)?.status ?? "pending";
  const actions: PhaseAction[] = [];
  const open = (phase: Phase, live: boolean) => {
    if (statusOf(phase) === "pending") actions.push({ phase, status: "open", opened: live });
  };
  const close = (phase: Phase) => {
    if (statusOf(phase) === "open") actions.push({ phase, status: "closed" });
  };
  const score = (phase: Phase, home: number, away: number) => {
    if (statusOf(phase) !== "scored") actions.push({ phase, status: "scored", actual_home: home, actual_away: away });
  };

  const { stage, home, away, shootoutHome, shootoutAway, decidedInRegulation } = detected;
  switch (stage) {
    case "pre":
      open("h1", false);
      break;
    case "first_half":
      close("h1");
      open("h2", true);
      break;
    case "halftime":
      score("h1", home, away);
      break;
    case "second_half":
      close("h1");
      close("h2");
      break;
    case "extra_time":
      score("h2", home, away);
      close("et");
      break;
    case "shootout":
      score("et", home, away);
      close("pens");
      break;
    case "complete":
      if (decidedInRegulation) {
        score("h2", home, away);
      } else if (shootoutHome != null && shootoutAway != null) {
        score("et", home, away);
        score("pens", shootoutHome, shootoutAway);
      } else {
        score("et", home, away);
      }
      close("h1");
      close("h2");
      close("et");
      close("pens");
      break;
  }
  return actions;
}

function scoreLiveCheckpoint(ph: number, pa: number, ah: number, aa: number): number {
  return ph === ah && pa === aa ? 2 : 0;
}

const PHASE_PUSH_LABEL: Record<Phase, string> = {
  h1: "Half-time",
  h2: "2nd-half",
  et: "Extra-time",
  pens: "Penalties",
};

// ─────────────────────────────────────────────────────────────────────────────

serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  const finalPass: Array<{ match_id: number; result: string }> = [];
  const checkpointPass: Array<{ match_id: number; result: string }> = [];

  // ── PASS 1: final-score scoring (unchanged behaviour) ──────────────────────
  // Only ever process matches that are NOT yet finished, guaranteeing already-
  // scored matches (the whole group stage) are never re-touched.
  const cutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const { data: finishMatches, error: finishErr } = await supabase
    .from("matches")
    .select(`id, kickoff_time, round_id, home_nation_id, away_nation_id,
      home_nation:home_nation_id(name), away_nation:away_nation_id(name)`)
    .neq("status", "finished")
    .lte("kickoff_time", cutoff);

  if (finishErr) {
    return new Response(JSON.stringify({ error: finishErr.message }), { status: 500 });
  }

  for (const match of (finishMatches ?? []) as Match[]) {
    const homeNation = Array.isArray(match.home_nation) ? match.home_nation[0] : match.home_nation;
    const awayNation = Array.isArray(match.away_nation) ? match.away_nation[0] : match.away_nation;
    if (!homeNation || !awayNation) {
      finalPass.push({ match_id: match.id, result: "skipped: missing nation data" });
      continue;
    }
    const espnHome = toEspnName(homeNation.name).toLowerCase();
    const espnAway = toEspnName(awayNation.name).toLowerCase();
    let score: { home: number; away: number } | null = null;
    for (const dateStr of datesToTry(match.kickoff_time)) {
      const events = await getEvents(dateStr);
      const comp = findCompetition(events, espnHome, espnAway);
      if (comp && comp.status?.type?.completed) {
        const h = comp.competitors.find((c) => c.homeAway === "home");
        const a = comp.competitors.find((c) => c.homeAway === "away");
        if (h && a) {
          const hs = parseInt(h.score, 10);
          const as = parseInt(a.score, 10);
          if (!isNaN(hs) && !isNaN(as)) { score = { home: hs, away: as }; break; }
        }
      }
    }
    if (!score) {
      finalPass.push({ match_id: match.id, result: "skipped: not completed on ESPN yet" });
      continue;
    }

    const { error: updateErr } = await supabase
      .from("matches")
      .update({ home_score: score.home, away_score: score.away, status: "finished", auto_fetched: true })
      .eq("id", match.id);
    if (updateErr) {
      finalPass.push({ match_id: match.id, result: `error: ${updateErr.message}` });
      continue;
    }

    const { data: predictions } = await supabase.from("predictions").select("id").eq("match_id", match.id);
    for (const pred of predictions ?? []) {
      await supabase.rpc("score_prediction", { p_id: pred.id as string });
    }

    const homeNationId = match.home_nation_id as number;
    const awayNationId = match.away_nation_id as number;
    const homeWin = score.home > score.away;
    const awayWin = score.away > score.home;
    const draw = score.home === score.away;
    const homePoints = homeWin ? 3 : draw ? 1 : 0;
    const awayPoints = awayWin ? 3 : draw ? 1 : 0;

    const { data: leagues } = await supabase.from("leagues").select("id");
    for (const league of leagues ?? []) {
      const { data: leagueMembers } = await supabase
        .from("league_members")
        .select("id, primary_nation_id, secondary_nation_id")
        .eq("league_id", league.id as string);
      const memberIds = (leagueMembers ?? []).map((m) => m.id as string);

      const heldByMember = new Map<string, { primary: number | null; secondary: number | null }>();
      if (memberIds.length > 0) {
        const { data: holdings } = await supabase
          .from("member_round_teams")
          .select("league_member_id, primary_nation_id, secondary_nation_id")
          .eq("round_id", match.round_id)
          .in("league_member_id", memberIds);
        for (const hld of holdings ?? []) {
          heldByMember.set(hld.league_member_id as string, {
            primary: hld.primary_nation_id as number | null,
            secondary: hld.secondary_nation_id as number | null,
          });
        }
      }

      await supabase.from("nation_bonus_points").delete().eq("match_id", match.id);
      const bonusRecords: { league_member_id: string; match_id: number; nation_id: number; pick_type: string; points: number }[] = [];
      for (const member of leagueMembers ?? []) {
        const held = heldByMember.get(member.id as string) ?? {
          primary: member.primary_nation_id as number | null,
          secondary: member.secondary_nation_id as number | null,
        };
        if (held.primary !== null) {
          const pts = held.primary === homeNationId ? homePoints : held.primary === awayNationId ? awayPoints : 0;
          if (pts > 0) bonusRecords.push({ league_member_id: member.id, match_id: match.id, nation_id: held.primary, pick_type: "primary", points: pts });
        }
        if (held.secondary !== null) {
          const pts = held.secondary === homeNationId ? homePoints * 2 : held.secondary === awayNationId ? awayPoints * 2 : 0;
          if (pts > 0) bonusRecords.push({ league_member_id: member.id, match_id: match.id, nation_id: held.secondary, pick_type: "secondary", points: pts });
        }
      }
      if (bonusRecords.length > 0) await supabase.from("nation_bonus_points").insert(bonusRecords);
    }
    finalPass.push({ match_id: match.id, result: `scored ${score.home}-${score.away}` });
  }

  // ── PASS 2: live checkpoint windows (knockouts only) ───────────────────────
  // Window of interest: from 3h before kickoff (so h1 opens pre-match) through
  // ~4h after (covers 90' + ET + pens). Never touches finished matches.
  const cpFrom = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
  const cpTo = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  const { data: liveMatches } = await supabase
    .from("matches")
    .select(`id, kickoff_time, round_id, home_nation_id, away_nation_id,
      home_nation:home_nation_id(name), away_nation:away_nation_id(name)`)
    .in("round_id", KNOCKOUT_ROUND_IDS)
    .neq("status", "finished")
    .gte("kickoff_time", cpFrom)
    .lte("kickoff_time", cpTo);

  const pushes: Array<{ title: string; body: string }> = [];

  for (const match of (liveMatches ?? []) as Match[]) {
    const homeNation = Array.isArray(match.home_nation) ? match.home_nation[0] : match.home_nation;
    const awayNation = Array.isArray(match.away_nation) ? match.away_nation[0] : match.away_nation;
    if (!homeNation || !awayNation) continue;

    const espnHome = toEspnName(homeNation.name).toLowerCase();
    const espnAway = toEspnName(awayNation.name).toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let comp: any = null;
    for (const dateStr of datesToTry(match.kickoff_time)) {
      const events = await getEvents(dateStr);
      comp = findCompetition(events, espnHome, espnAway);
      if (comp) break;
    }
    if (!comp) { checkpointPass.push({ match_id: match.id, result: "no espn event" }); continue; }

    const detected = mapEspnCompetition(comp);
    if (!detected) { checkpointPass.push({ match_id: match.id, result: "unmappable" }); continue; }

    const { data: storedRows } = await supabase
      .from("match_checkpoint_phases")
      .select("phase, status")
      .eq("match_id", match.id);
    const stored = (storedRows ?? []) as StoredPhase[];

    const actions = computePhaseTransitions(stored, detected);
    if (actions.length === 0) { checkpointPass.push({ match_id: match.id, result: `${detected.stage}: no-op` }); continue; }

    const ts = new Date().toISOString();
    for (const action of actions) {
      const row: Record<string, unknown> = { match_id: match.id, phase: action.phase, status: action.status, updated_at: ts };
      if (action.status === "open") row.opened_at = ts;
      if (action.status === "closed" || action.status === "scored") row.closed_at = ts;
      if (action.status === "scored") { row.actual_home = action.actual_home; row.actual_away = action.actual_away; }
      await supabase.from("match_checkpoint_phases").upsert(row, { onConflict: "match_id,phase" });

      if (action.status === "scored") {
        const { data: picks } = await supabase
          .from("live_checkpoint_predictions")
          .select("id, predicted_home, predicted_away")
          .eq("match_id", match.id)
          .eq("phase", action.phase);
        for (const pick of picks ?? []) {
          const pts = scoreLiveCheckpoint(pick.predicted_home as number, pick.predicted_away as number, action.actual_home as number, action.actual_away as number);
          await supabase.from("live_checkpoint_predictions").update({ points: pts, updated_at: ts }).eq("id", pick.id as string);
        }
      }

      // Push only when a LIVE window opens (h2/et/pens) — never for h1.
      if (action.opened && action.phase !== "h1") {
        pushes.push({
          title: `⚽ ${PHASE_PUSH_LABEL[action.phase]} predictions open`,
          body: `${homeNation.name} vs ${awayNation.name} — predict the next checkpoint now.`,
        });
      }
    }
    checkpointPass.push({ match_id: match.id, result: `${detected.stage}: ${actions.map((a) => `${a.phase}=${a.status}`).join(",")}` });
  }

  // Fire window-open pushes (fire-and-forget).
  for (const p of pushes) {
    await fetch(`${SITE_URL}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ title: p.title, body: p.body, url: "/predict" }),
    }).catch(() => {});
  }

  return new Response(
    JSON.stringify({ final: finalPass, checkpoints: checkpointPass, pushes: pushes.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
