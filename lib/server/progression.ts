// Knockout progression-bonus engine (pure). Awarded when a held team reaches a
// knockout milestone. See docs/knockout-reassignment-spec.md.
//
//   reach RO32 (survive group) +3
//   reach RO16                +10
//   reach QF                  +20
//   reach SF                  +30
//   win the bronze final      +35
//   reach Final (runner-up)   +40
//   win the tournament        +50
//
// Multiplier: primary 1x, secondary 2x. (Per spec, secondary only ever earns the
// reach-RO16 milestone before it dissolves — but that constraint is enforced by
// the CALLER, which only passes the relevant holdings for each milestone. This
// function stays general: base x multiplier for any holding in the advancing set.)

export const MILESTONE_BONUS = {
  ro32: 3,
  r16: 10,
  qf: 20,
  sf: 30,
  bronze: 35,
  final: 40,
  win: 50,
} as const;

export type Milestone = keyof typeof MILESTONE_BONUS;

export interface ProgressionHolding {
  league_member_id: string;
  nation_id: number;
  pick_type: "primary" | "secondary";
}

export interface ProgressionBonusRow {
  league_member_id: string;
  milestone: Milestone;
  nation_id: number;
  pick_type: "primary" | "secondary";
  points: number;
}

export function computeProgressionBonus(
  milestone: Milestone,
  advancingNationIds: Iterable<number>,
  holdings: ProgressionHolding[]
): ProgressionBonusRow[] {
  const advancing = advancingNationIds instanceof Set ? advancingNationIds : new Set(advancingNationIds);
  const base = MILESTONE_BONUS[milestone];

  const rows: ProgressionBonusRow[] = [];
  for (const h of holdings) {
    if (!advancing.has(h.nation_id)) continue;
    rows.push({
      league_member_id: h.league_member_id,
      milestone,
      nation_id: h.nation_id,
      pick_type: h.pick_type,
      points: base * (h.pick_type === "secondary" ? 2 : 1),
    });
  }
  return rows;
}
