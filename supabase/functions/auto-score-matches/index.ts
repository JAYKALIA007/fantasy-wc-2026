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

// Knockout round_id -> the eliminated_in_round tag set on the losing team when a
// match finalizes. Mirrors ROUND_ELIM_TAG in app/api/admin/match-score; drives
// the bracket contest + progression bonuses.
const ROUND_ELIM_TAG: Record<string, string> = {
  "a0000000-0000-0000-0000-000000000003": "ro32",
  "a0000000-0000-0000-0000-000000000002": "r16",
  "a0000000-0000-0000-0000-000000000004": "qf",
  "a0000000-0000-0000-0000-000000000005": "sf",
  "a0000000-0000-0000-0000-000000000006": "final",
  "a0000000-0000-0000-0000-000000000008": "bronze",
};

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

type MatchStage = "pre" | "first_half" | "halftime" | "second_half" | "end_regulation" | "extra_time" | "end_et" | "shootout" | "complete";
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

function isExactStatus(t: { detail?: string; shortDetail?: string }, token: string): boolean {
  const d = (t.detail ?? "").trim().toLowerCase();
  const s = (t.shortDetail ?? "").trim().toLowerCase();
  return d === token || s === token;
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
    const level = h === a;
    const halftime = hasKw(type, "halftime") || hasKw(type, "half-time") || hasKw(type, "half time") || isExactStatus(type, "ht");
    const shootout = period >= 5 || hasKw(type, "shootout") || hasKw(type, "penalt");
    const extra = period === 3 || period === 4 || hasKw(type, "extra");
    const endMarker =
      hasKw(type, "end of") || hasKw(type, "full time") || hasKw(type, "full-time") ||
      hasKw(type, "regulation") || hasKw(type, "aet") || isExactStatus(type, "ft");

    if (halftime) {
      stage = "halftime";
    } else if (shootout) {
      stage = "shootout";
    } else if (level && period === 4 && endMarker) {
      stage = "end_et";
    } else if (extra) {
      stage = "extra_time";
    } else if (level && period === 2 && endMarker) {
      stage = "end_regulation";
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
      // Both h1 + h2 shown upfront, no push. (Mirror of lib/server/checkpointPhases.ts)
      open("h1", false);
      open("h2", false);
      break;
    case "first_half":
      close("h1");
      open("h2", false); // quiet fallback if pre was missed
      break;
    case "halftime":
      score("h1", home, away);
      // h2 stays OPEN through the break — locks at 2nd-half kickoff.
      break;
    case "second_half":
      close("h1");
      close("h2"); // 2nd half kicked off — lock the 90' prediction
      break;
    case "end_regulation":
      // 90' over and level → going to ET. Snapshot 90' boundary, open et.
      close("h2");
      score("h2", home, away);
      if (home === away) open("et", true);
      break;
    case "extra_time":
      score("h2", home, away); // recovery if end_regulation was missed
      close("et");
      break;
    case "end_et":
      // 120' over and level → going to pens. Snapshot 120' boundary, open pens.
      score("et", home, away);
      if (home === away) open("pens", true);
      break;
    case "shootout":
      score("et", home, away); // recovery if end_et was missed
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

  // ── PASS 1: final-score scoring ────────────────────────────────────────────
  // Only ever process matches that are NOT yet finished, guaranteeing already-
  // scored matches (the whole group stage) are never re-touched.
  //
  // ESPN's `completed` flag (checked in the loop below) is the real source of
  // truth for whether a match is over. This time floor is only a coarse
  // pre-filter / glitch guard: a match cannot legitimately be complete before
  // ~105 min (45 + half-time + 45 + stoppage), so a 100-min floor clears BEFORE
  // any regulation full-time (~110 min) — no finalization lag — while still
  // preventing us from finalizing mid-match if ESPN momentarily reports
  // `completed=true` during play. Matches that run to extra time / penalties are
  // already past this floor and finalize whenever ESPN marks them complete.
  const cutoff = new Date(now.getTime() - 100 * 60 * 1000).toISOString();
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
    let score: { home: number; away: number; shootoutHome: number | null; shootoutAway: number | null } | null = null;
    for (const dateStr of datesToTry(match.kickoff_time)) {
      const events = await getEvents(dateStr);
      const comp = findCompetition(events, espnHome, espnAway);
      if (comp && comp.status?.type?.completed) {
        const h = comp.competitors.find((c) => c.homeAway === "home");
        const a = comp.competitors.find((c) => c.homeAway === "away");
        if (h && a) {
          const hs = parseInt(h.score, 10);
          const as = parseInt(a.score, 10);
          if (!isNaN(hs) && !isNaN(as)) {
            score = { home: hs, away: as, shootoutHome: h.shootoutScore ?? null, shootoutAway: a.shootoutScore ?? null };
            break;
          }
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

    // Knockout: tag the loser eliminated at this round so the bracket + progression
    // bonuses resolve without a manual admin step. Winner = shootout winner when a
    // shootout was played, else the higher score. A still-level result with no
    // shootout has no derivable winner, so leave it for the admin backup rather
    // than mis-tag.
    const elimTag = ROUND_ELIM_TAG[match.round_id];
    if (elimTag && match.home_nation_id !== null && match.away_nation_id !== null) {
      const usePens = score.shootoutHome !== null && score.shootoutAway !== null;
      const decided = usePens ? score.shootoutHome !== score.shootoutAway : score.home !== score.away;
      if (decided) {
        const homeAdvances = usePens
          ? (score.shootoutHome as number) > (score.shootoutAway as number)
          : score.home > score.away;
        const winnerId = homeAdvances ? match.home_nation_id : match.away_nation_id;
        const loserId = homeAdvances ? match.away_nation_id : match.home_nation_id;
        await supabase.from("nations").update({ eliminated: true, eliminated_in_round: elimTag }).eq("id", loserId);
        await supabase.from("nations").update({ eliminated: false, eliminated_in_round: null }).eq("id", winnerId);
      }
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

  // ── PASS 1.5: open h1 + h2 UPFRONT for all upcoming knockout matches ────────
  // Opening needs no ESPN data, so it isn't gated by the live proximity window:
  // the HT and FT score inputs appear as soon as the match exists, exactly like
  // the regular scoreline prediction. Insert-ignore leaves existing phase rows
  // (and their statuses) untouched, so this never re-opens a closed window.
  const { data: upcomingKo } = await supabase
    .from("matches")
    .select("id")
    .in("round_id", KNOCKOUT_ROUND_IDS)
    .eq("status", "scheduled")
    .gt("kickoff_time", now.toISOString());
  let upfrontOpened = 0;
  for (const m of (upcomingKo ?? []) as { id: number }[]) {
    for (const phase of ["h1", "h2"] as const) {
      await supabase
        .from("match_checkpoint_phases")
        .upsert(
          { match_id: m.id, phase, status: "open", opened_at: now.toISOString(), updated_at: now.toISOString() },
          { onConflict: "match_id,phase", ignoreDuplicates: true }
        );
    }
    upfrontOpened++;
  }

  // ── PASS 2: live checkpoint windows (knockouts only) ───────────────────────
  // Closing/scoring/snapshotting + lazy et/pens need live ESPN state, so this
  // pass stays proximity-windowed: ~4h before kickoff through ~3h after.
  //
  // NOTE: we deliberately do NOT filter out status='finished' here. PASS 1 runs
  // first and finalizes a match the moment ESPN reports it complete — but the
  // "complete" stage is exactly where h2 (90') and pens (shootout) get scored.
  // Excluding finished matches would mean those final checkpoints never score
  // for any match that completes after kickoff+2h (all ET/penalty matches, and
  // 90' matches with long stoppage). The state machine is idempotent, so re-
  // visiting an already-scored finished match just produces zero actions.
  const cpFrom = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
  const cpTo = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  const { data: liveMatches } = await supabase
    .from("matches")
    .select(`id, kickoff_time, round_id, home_nation_id, away_nation_id,
      home_nation:home_nation_id(name), away_nation:away_nation_id(name)`)
    .in("round_id", KNOCKOUT_ROUND_IDS)
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
    JSON.stringify({ final: finalPass, upfrontOpened, checkpoints: checkpointPass, pushes: pushes.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
