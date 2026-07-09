// ESPN phase-mapper (pure). Maps an ESPN soccer scoreboard event-status payload
// into a stable, app-specific view of where the match is and the current score.
//
// ESPN signals we rely on (verified against the fifa.world scoreboard API, 2026):
//   status.type.state      "pre" | "in" | "post"
//   status.type.completed  boolean
//   status.type.description "Scheduled" | "Halftime" | "Full Time" | ...
//   status.period          1=1st half, 2=2nd half, 3/4=extra time, 5=shootout
//   competitor.score         cumulative goals (string)
//   competitor.shootoutScore penalty tally (number | null) — best-effort
//
// ET / penalty detection is explicitly best-effort (ESPN reports shootouts
// unreliably); the cron pairs this with a full admin manual override.

export type MatchStage =
  | "pre" // before kickoff
  | "first_half" // 1st half in progress
  | "halftime" // half-time break — the moment the h1 (HT) score is final
  | "second_half" // 2nd half in progress
  | "end_regulation" // 90' over AND level → heading to extra time (et opens here)
  | "extra_time" // extra time in progress
  | "end_et" // 120' over AND level → heading to penalties (pens opens here)
  | "shootout" // penalty shootout in progress
  | "complete"; // match over (regulation, ET, or pens)

export interface EspnStatusType {
  state?: string;
  completed?: boolean;
  description?: string;
  detail?: string;
  shortDetail?: string;
}

export interface EspnCompetitorLike {
  homeAway?: string;
  score?: string | number;
  shootoutScore?: number | null;
}

export interface EspnCompetitionLike {
  competitors?: EspnCompetitorLike[];
  status?: { type?: EspnStatusType; period?: number | null };
}

export interface DetectedState {
  stage: MatchStage;
  home: number; // current cumulative goals
  away: number;
  shootoutHome: number | null;
  shootoutAway: number | null;
  period: number; // 0 if unknown/pre
  isComplete: boolean;
  /** True only when the match finished in regulation (no ET played). Lets the
   * state machine treat the final score as the 90' (h2) boundary safely. */
  decidedInRegulation: boolean;
}

function num(v: string | number | undefined | null): number {
  if (v == null) return NaN;
  const n = typeof v === "number" ? v : parseInt(v, 10);
  return n;
}

function hasKeyword(t: EspnStatusType | undefined, kw: string): boolean {
  if (!t) return false;
  const blob = `${t.description ?? ""} ${t.detail ?? ""} ${t.shortDetail ?? ""}`.toLowerCase();
  return blob.includes(kw);
}

// Exact-token match on the short status fields — ESPN often abbreviates the live
// break states (e.g. detail/shortDetail = "HT" at half-time, "FT" at full-time),
// which a loose substring search would miss or mis-hit.
function isExactStatus(t: EspnStatusType | undefined, token: string): boolean {
  if (!t) return false;
  const d = (t.detail ?? "").trim().toLowerCase();
  const s = (t.shortDetail ?? "").trim().toLowerCase();
  return d === token || s === token;
}

// Returns null if the competition payload is unusable (missing competitors).
// `swapped` is set when ESPN lists the fixture with home/away reversed from our
// seed; the scores are then mapped back to OUR orientation. Stage detection is
// orientation-symmetric, so only the score fields flip.
export function mapEspnCompetition(comp: EspnCompetitionLike, swapped = false): DetectedState | null {
  const competitors = comp.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const h = num(home.score);
  const a = num(away.score);
  if (isNaN(h) || isNaN(a)) return null;

  const shootoutHome = home.shootoutScore ?? null;
  const shootoutAway = away.shootoutScore ?? null;

  const type = comp.status?.type;
  const state = (type?.state ?? "").toLowerCase();
  const completed = type?.completed === true;
  const period = comp.status?.period ?? 0;

  let stage: MatchStage;
  let decidedInRegulation = false;

  if (state === "pre") {
    stage = "pre";
  } else if (completed || state === "post") {
    stage = "complete";
    // No ET played → the final score IS the 90' (h2) boundary.
    decidedInRegulation = (period || 0) <= 2 && shootoutHome == null && shootoutAway == null;
  } else {
    // In progress — disambiguate by description/period. The end-of-phase "break"
    // states (end_regulation, end_et) require the match to be LEVEL and carry an
    // end/full-time keyword, so normal in-play never trips them.
    const level = h === a;
    const halftime =
      hasKeyword(type, "halftime") ||
      hasKeyword(type, "half-time") ||
      hasKeyword(type, "half time") ||
      isExactStatus(type, "ht");
    // A populated penalty tally is the most reliable in-play signal that the
    // shootout has begun — ESPN often still reports period 4 / "AET" text during
    // pens, which would otherwise fall through to end_et and leave pens open.
    const shootout =
      period >= 5 ||
      shootoutHome != null ||
      shootoutAway != null ||
      hasKeyword(type, "shootout") ||
      hasKeyword(type, "penalt");
    const extra = period === 3 || period === 4 || hasKeyword(type, "extra");
    // "End of <phase>" markers ESPN shows during the break before ET / pens.
    const endMarker =
      hasKeyword(type, "end of") ||
      hasKeyword(type, "full time") ||
      hasKeyword(type, "full-time") ||
      hasKeyword(type, "regulation") ||
      hasKeyword(type, "aet") ||
      isExactStatus(type, "ft");

    if (halftime) {
      stage = "halftime";
    } else if (shootout) {
      stage = "shootout";
    } else if (level && period === 4 && endMarker) {
      stage = "end_et"; // 120' done, still level → penalties next
    } else if (extra) {
      stage = "extra_time";
    } else if (level && period === 2 && endMarker) {
      stage = "end_regulation"; // 90' done, still level → extra time next
    } else if (period === 2) {
      stage = "second_half";
    } else {
      // period 1 (or unknown but in-progress) → first half
      stage = "first_half";
    }
  }

  return {
    stage,
    home: swapped ? a : h,
    away: swapped ? h : a,
    shootoutHome: swapped ? shootoutAway : shootoutHome,
    shootoutAway: swapped ? shootoutHome : shootoutAway,
    period: period || 0,
    isComplete: stage === "complete",
    decidedInRegulation,
  };
}
