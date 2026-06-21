import { describe, it, expect } from "vitest";
import { computeProgressionBonus, MILESTONE_BONUS, type ProgressionHolding } from "@/lib/server/progression";

const h = (id: string, nation: number, type: "primary" | "secondary"): ProgressionHolding => ({
  league_member_id: id,
  nation_id: nation,
  pick_type: type,
});

describe("computeProgressionBonus", () => {
  it("awards the milestone base to a primary holder of an advancing team", () => {
    const rows = computeProgressionBonus("r16", [10], [h("m1", 10, "primary")]);
    expect(rows).toEqual([
      { league_member_id: "m1", milestone: "r16", nation_id: 10, pick_type: "primary", points: 10 },
    ]);
  });

  it("doubles for a secondary holder", () => {
    const rows = computeProgressionBonus("r16", [10], [h("m1", 10, "secondary")]);
    expect(rows[0].points).toBe(20);
  });

  it("awards nothing if the held team did not advance", () => {
    expect(computeProgressionBonus("qf", [10], [h("m1", 99, "primary")])).toEqual([]);
  });

  it("uses the correct base per milestone (primary)", () => {
    const cases: [keyof typeof MILESTONE_BONUS, number][] = [
      ["ro32", 5],
      ["r16", 10],
      ["qf", 20],
      ["sf", 30],
      ["final", 40],
      ["win", 50],
    ];
    for (const [milestone, base] of cases) {
      const rows = computeProgressionBonus(milestone, [7], [h("m1", 7, "primary")]);
      expect(rows[0].points).toBe(base);
    }
  });

  it("secondary reaching RO16 is the +20 farewell from the spec", () => {
    const rows = computeProgressionBonus("r16", [42], [h("m1", 42, "secondary")]);
    expect(rows[0].points).toBe(20);
  });

  it("handles many holders and multiple advancing teams", () => {
    const rows = computeProgressionBonus(
      "qf",
      new Set([1, 2]),
      [
        h("m1", 1, "primary"), // +20
        h("m2", 2, "secondary"), // +40
        h("m3", 3, "primary"), // not advancing
      ]
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.league_member_id === "m1")?.points).toBe(20);
    expect(rows.find((r) => r.league_member_id === "m2")?.points).toBe(40);
  });

  it("accepts both an array and a Set for advancing ids", () => {
    expect(computeProgressionBonus("sf", [5], [h("m1", 5, "primary")])[0].points).toBe(30);
    expect(computeProgressionBonus("sf", new Set([5]), [h("m1", 5, "primary")])[0].points).toBe(30);
  });
});
