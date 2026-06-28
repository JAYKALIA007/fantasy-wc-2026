// Resolving which team(s) a member effectively holds (pure).
//
// A member's group-stage pick lives on league_members; once knockouts begin,
// each re-draft writes a per-round holding to member_round_teams. The redrafted
// team becomes the member's "real" held team — it is what displays on profile /
// nation and what earns the per-match nation bonus. A member who never redrafts
// has no holding row and simply carries their group pick forward.
//
// See docs/knockout-reassignment-spec.md.

import { ROUND_IDS } from "@/lib/constants";

// Round progression rank — higher is later in the tournament. Group stage is the
// baseline; the latest holding by this rank is the "current" team.
const ROUND_RANK: Record<string, number> = {
  [ROUND_IDS.group_stage]: 0,
  [ROUND_IDS.ro32]: 1,
  [ROUND_IDS.r16]: 2,
  [ROUND_IDS.qf]: 3,
  [ROUND_IDS.sf]: 4,
  [ROUND_IDS.bronze]: 5,
  [ROUND_IDS.final]: 6,
};

export interface HeldTeams {
  primary_nation_id: number | null;
  secondary_nation_id: number | null;
}

export interface HoldingRow extends HeldTeams {
  round_id: string;
}

// The team(s) a member holds going INTO a specific round: their re-draft holding
// for that round if it exists, else their carried-forward group pick. Used to
// score the per-match nation bonus against the team actually held that round.
export function holdingForRound(
  groupPick: HeldTeams,
  holdings: HoldingRow[],
  roundId: string
): HeldTeams {
  const h = holdings.find((x) => x.round_id === roundId);
  return h
    ? { primary_nation_id: h.primary_nation_id, secondary_nation_id: h.secondary_nation_id }
    : groupPick;
}

// The team(s) a member currently holds — the latest knockout holding by round
// progression, else the group pick. Used for display ("your nations").
export function currentHolding(groupPick: HeldTeams, holdings: HoldingRow[]): HeldTeams {
  let best: HoldingRow | null = null;
  let bestRank = 0;
  for (const h of holdings) {
    const rank = ROUND_RANK[h.round_id] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = h;
    }
  }
  return best
    ? { primary_nation_id: best.primary_nation_id, secondary_nation_id: best.secondary_nation_id }
    : groupPick;
}
