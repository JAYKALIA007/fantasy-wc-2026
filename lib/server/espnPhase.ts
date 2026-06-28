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
  | "extra_time" // extra time in progress
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

// Returns null if the competition payload is unusable (missing competitors).
export function mapEspnCompetition(comp: EspnCompetitionLike): DetectedState | null {
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
    // In progress — disambiguate by description first (halftime break), then period.
    if (hasKeyword(type, "halftime") || hasKeyword(type, "half-time") || hasKeyword(type, "half time")) {
      stage = "halftime";
    } else if (period >= 5 || hasKeyword(type, "shootout") || hasKeyword(type, "penalties")) {
      stage = "shootout";
    } else if (period === 3 || period === 4 || hasKeyword(type, "extra")) {
      stage = "extra_time";
    } else if (period === 2) {
      stage = "second_half";
    } else {
      // period 1 (or unknown but in-progress) → first half
      stage = "first_half";
    }
  }

  return {
    stage,
    home: h,
    away: a,
    shootoutHome,
    shootoutAway,
    period: period || 0,
    isComplete: stage === "complete",
    decidedInRegulation,
  };
}
