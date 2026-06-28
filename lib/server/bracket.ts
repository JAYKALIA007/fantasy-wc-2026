// Bracket-contest scoring (pure). Each RO32 tie resolves when exactly one of its
// two teams is eliminated at the RO32; the other is the advancer. A player's pick
// is correct if it names that advancer. Unresolved ties score nothing yet.

export interface BracketTie {
  match_id: number;
  home_nation_id: number;
  away_nation_id: number;
}

export interface BracketPick {
  user_id: string;
  match_id: number;
  advancer_nation_id: number;
}

export interface BracketStanding {
  user_id: string;
  correct: number;
  picked: number;
}

// resolvedAdvancer: match_id -> nation_id that advanced (only for decided ties).
export function resolveAdvancers(ties: BracketTie[], eliminatedNationIds: Set<number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const t of ties) {
    const homeOut = eliminatedNationIds.has(t.home_nation_id);
    const awayOut = eliminatedNationIds.has(t.away_nation_id);
    if (homeOut !== awayOut) {
      out.set(t.match_id, homeOut ? t.away_nation_id : t.home_nation_id);
    }
  }
  return out;
}

export function scoreBracket(
  userIds: string[],
  picks: BracketPick[],
  advancerByMatch: Map<number, number>
): BracketStanding[] {
  const correct = new Map<string, number>();
  const picked = new Map<string, number>();
  for (const p of picks) {
    picked.set(p.user_id, (picked.get(p.user_id) ?? 0) + 1);
    if (advancerByMatch.get(p.match_id) === p.advancer_nation_id) {
      correct.set(p.user_id, (correct.get(p.user_id) ?? 0) + 1);
    }
  }
  return userIds
    .map((user_id) => ({ user_id, correct: correct.get(user_id) ?? 0, picked: picked.get(user_id) ?? 0 }))
    .sort((a, b) => b.correct - a.correct || b.picked - a.picked);
}
