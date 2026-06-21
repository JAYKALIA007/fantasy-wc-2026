import { describe, it, expect } from "vitest";
import { computeNationBonus, type MatchResult, type MemberPicks } from "@/lib/server/nationBonus";

// Nation ids: home = 10, away = 20, unrelated = 99
const match = (home: number, away: number): MatchResult => ({
  match_id: 1,
  home_nation_id: 10,
  away_nation_id: 20,
  home_score: home,
  away_score: away,
});

const member = (
  id: string,
  primary: number | null,
  secondary: number | null
): MemberPicks => ({ league_member_id: id, primary_nation_id: primary, secondary_nation_id: secondary });

describe("computeNationBonus", () => {
  it("awards +3 to a primary holder of the home winner", () => {
    const rows = computeNationBonus(match(2, 0), [member("m1", 10, null)]);
    expect(rows).toEqual([
      { league_member_id: "m1", match_id: 1, nation_id: 10, pick_type: "primary", points: 3 },
    ]);
  });

  it("awards +3 to a primary holder of the away winner", () => {
    const rows = computeNationBonus(match(0, 2), [member("m1", 20, null)]);
    expect(rows[0]).toMatchObject({ nation_id: 20, pick_type: "primary", points: 3 });
  });

  it("awards +1 for a primary draw", () => {
    const rows = computeNationBonus(match(1, 1), [member("m1", 10, null)]);
    expect(rows[0]).toMatchObject({ pick_type: "primary", points: 1 });
  });

  it("doubles secondary: +6 win, +2 draw", () => {
    expect(computeNationBonus(match(2, 0), [member("m1", null, 10)])[0]).toMatchObject({
      pick_type: "secondary",
      points: 6,
    });
    expect(computeNationBonus(match(1, 1), [member("m1", null, 10)])[0]).toMatchObject({
      pick_type: "secondary",
      points: 2,
    });
  });

  it("emits no row for a losing team", () => {
    expect(computeNationBonus(match(0, 2), [member("m1", 10, null)])).toEqual([]);
  });

  it("emits no row when the member holds neither nation", () => {
    expect(computeNationBonus(match(2, 0), [member("m1", 99, 99)])).toEqual([]);
  });

  it("emits no rows for null picks", () => {
    expect(computeNationBonus(match(2, 0), [member("m1", null, null)])).toEqual([]);
  });

  it("emits both rows when a member holds the home team as primary and away as secondary", () => {
    const rows = computeNationBonus(match(2, 1), [member("m1", 10, 20)]);
    // home wins -> primary +3; away loses -> secondary 0 (no row)
    expect(rows).toEqual([
      { league_member_id: "m1", match_id: 1, nation_id: 10, pick_type: "primary", points: 3 },
    ]);
  });

  it("handles multiple members independently", () => {
    const rows = computeNationBonus(match(1, 1), [
      member("m1", 10, null), // primary draw +1
      member("m2", null, 20), // secondary draw +2
      member("m3", 99, 99), // nothing
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.league_member_id === "m1")?.points).toBe(1);
    expect(rows.find((r) => r.league_member_id === "m2")?.points).toBe(2);
  });
});
