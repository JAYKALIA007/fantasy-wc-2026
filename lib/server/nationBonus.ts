// Pure nation-bonus scoring, extracted from the match-score handler so it can be
// unit-tested and reused (the pre-launch backfill, future match-score refactor,
// Phase 2 progression work). Mirrors the handler's logic exactly:
//   primary   win +3 / draw +1
//   secondary win +6 / draw +2   (wildcard, 2x)
// A team that loses, or that a member does not hold, earns nothing — no row is
// emitted (matching the handler, which only inserts rows with points > 0).

export interface MatchResult {
  match_id: number;
  home_nation_id: number | null;
  away_nation_id: number | null;
  home_score: number;
  away_score: number;
}

export interface MemberPicks {
  league_member_id: string;
  primary_nation_id: number | null;
  secondary_nation_id: number | null;
}

export interface NationBonusRow {
  league_member_id: string;
  match_id: number;
  nation_id: number;
  pick_type: "primary" | "secondary";
  points: number;
}

export function computeNationBonus(
  match: MatchResult,
  members: MemberPicks[]
): NationBonusRow[] {
  const { home_nation_id, away_nation_id, home_score, away_score } = match;

  const homeWin = home_score > away_score;
  const awayWin = away_score > home_score;
  const draw = home_score === away_score;

  const homePoints = homeWin ? 3 : draw ? 1 : 0;
  const awayPoints = awayWin ? 3 : draw ? 1 : 0;

  const rows: NationBonusRow[] = [];

  for (const member of members) {
    // Primary (1x)
    if (member.primary_nation_id !== null) {
      let pts = 0;
      if (home_nation_id !== null && member.primary_nation_id === home_nation_id) pts = homePoints;
      else if (away_nation_id !== null && member.primary_nation_id === away_nation_id) pts = awayPoints;
      if (pts > 0) {
        rows.push({
          league_member_id: member.league_member_id,
          match_id: match.match_id,
          nation_id: member.primary_nation_id,
          pick_type: "primary",
          points: pts,
        });
      }
    }

    // Secondary / wildcard (2x)
    if (member.secondary_nation_id !== null) {
      let pts = 0;
      if (home_nation_id !== null && member.secondary_nation_id === home_nation_id) pts = homePoints * 2;
      else if (away_nation_id !== null && member.secondary_nation_id === away_nation_id) pts = awayPoints * 2;
      if (pts > 0) {
        rows.push({
          league_member_id: member.league_member_id,
          match_id: match.match_id,
          nation_id: member.secondary_nation_id,
          pick_type: "secondary",
          points: pts,
        });
      }
    }
  }

  return rows;
}
