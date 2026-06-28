import { describe, it, expect } from "vitest";
import { resolveAdvancers, scoreBracket, type BracketTie, type BracketPick } from "@/lib/server/bracket";

const ties: BracketTie[] = [
  { match_id: 1, home_nation_id: 10, away_nation_id: 11 },
  { match_id: 2, home_nation_id: 20, away_nation_id: 21 },
  { match_id: 3, home_nation_id: 30, away_nation_id: 31 },
];

describe("resolveAdvancers", () => {
  it("resolves a tie only when exactly one team is eliminated", () => {
    const adv = resolveAdvancers(ties, new Set([11, 20]));
    expect(adv.get(1)).toBe(10); // 11 out -> 10 advances
    expect(adv.get(2)).toBe(21); // 20 out -> 21 advances
    expect(adv.has(3)).toBe(false); // neither out -> unresolved
  });

  it("treats both-eliminated as unresolved (data anomaly)", () => {
    const adv = resolveAdvancers(ties, new Set([10, 11]));
    expect(adv.has(1)).toBe(false);
  });
});

describe("scoreBracket", () => {
  const picks: BracketPick[] = [
    { user_id: "u1", match_id: 1, advancer_nation_id: 10 }, // correct
    { user_id: "u1", match_id: 2, advancer_nation_id: 20 }, // wrong (21 advanced)
    { user_id: "u1", match_id: 3, advancer_nation_id: 30 }, // unresolved
    { user_id: "u2", match_id: 1, advancer_nation_id: 11 }, // wrong
  ];

  it("counts correct picks against resolved advancers and sorts", () => {
    const adv = resolveAdvancers(ties, new Set([11, 20]));
    const rows = scoreBracket(["u1", "u2", "u3"], picks, adv);
    expect(rows[0]).toEqual({ user_id: "u1", correct: 1, picked: 3 });
    expect(rows.find((r) => r.user_id === "u2")).toEqual({ user_id: "u2", correct: 0, picked: 1 });
    expect(rows.find((r) => r.user_id === "u3")).toEqual({ user_id: "u3", correct: 0, picked: 0 });
  });
});
