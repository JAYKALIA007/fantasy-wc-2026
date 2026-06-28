import { describe, it, expect } from "vitest";
import { computeLeaderboard } from "@/lib/server/leaderboard";

// Minimal mock of the Supabase query builder: every chained method returns the
// same thenable, which resolves to { data } for the requested table.
function mockSupabase(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const result = { data: tables[table] ?? [] };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        not: () => chain,
        then: (resolve: (v: unknown) => unknown) => resolve(result),
      };
      return chain;
    },
  };
}

describe("computeLeaderboard", () => {
  it("totals prediction + nation bonus + progression − swap penalty, and sorts", async () => {
    const supabase = mockSupabase({
      league_members: [
        { id: "m1", user_id: "u1", profile_name: "Alice", primary_nation_id: 1, joined_at: "2026-06-14T00:00:00Z" },
        { id: "m2", user_id: "u2", profile_name: "Bob", primary_nation_id: 2, joined_at: "2026-06-15T00:00:00Z" },
        { id: "admin", user_id: "uAdmin", profile_name: "Admin", primary_nation_id: null, joined_at: "2026-06-13T00:00:00Z" },
      ],
      predictions: [
        { user_id: "u1", points: 10 },
        { user_id: "u2", points: 5 },
        { user_id: "u1" },
      ],
      nation_bonus_points: [{ league_member_id: "m1", points: 3 }],
      progression_bonus_points: [
        { league_member_id: "m1", points: 10 },
        { league_member_id: "m2", points: 20 },
      ],
      swap_penalties: [{ league_member_id: "m1", amount: 5 }],
    });

    // Cumulative (roundId === null): every component, including progression.
    const rows = await computeLeaderboard(supabase, "league-1", "uAdmin", null);

    // Admin excluded
    expect(rows.map((r) => r.user_id)).not.toContain("uAdmin");

    // u1 = 10 + 3 + 10 − 5 = 18 ; u2 = 5 + 0 + 20 − 0 = 25
    const u1 = rows.find((r) => r.user_id === "u1")!;
    const u2 = rows.find((r) => r.user_id === "u2")!;
    expect(u1.total_points).toBe(18);
    expect(u1.progression_bonus).toBe(10);
    expect(u1.swap_penalty).toBe(5);
    expect(u2.total_points).toBe(25);

    // u2 (25) ranks above u1 (18)
    expect(rows[0].user_id).toBe("u2");
    expect(rows[1].user_id).toBe("u1");
    expect(u1.finished_prediction_count).toBe(2);
    expect(u2.finished_prediction_count).toBe(1);
  });

  it("excludes progression bonus from a per-round (roundId set) standing", async () => {
    const supabase = mockSupabase({
      league_members: [
        { id: "m1", user_id: "u1", profile_name: "Alice", primary_nation_id: 1, joined_at: "2026-06-14T00:00:00Z" },
        { id: "m2", user_id: "u2", profile_name: "Bob", primary_nation_id: 2, joined_at: "2026-06-15T00:00:00Z" },
      ],
      predictions: [
        { user_id: "u1", points: 10 },
        { user_id: "u2", points: 5 },
      ],
      nation_bonus_points: [{ league_member_id: "m1", points: 3 }],
      // Present in the table but must NOT be counted for a per-round view —
      // reach-RO32 etc. is a between-rounds reward, not points earned in-round.
      progression_bonus_points: [
        { league_member_id: "m1", points: 10 },
        { league_member_id: "m2", points: 20 },
      ],
      swap_penalties: [{ league_member_id: "m1", amount: 5 }],
    });

    const rows = await computeLeaderboard(supabase, "league-1", null, "round-1");

    const u1 = rows.find((r) => r.user_id === "u1")!;
    const u2 = rows.find((r) => r.user_id === "u2")!;
    // u1 = 10 + 3 − 5 = 8 (no +10 progression) ; u2 = 5 (no +20 progression)
    expect(u1.progression_bonus).toBe(0);
    expect(u2.progression_bonus).toBe(0);
    expect(u1.total_points).toBe(8);
    expect(u2.total_points).toBe(5);
  });

  it("breaks ties on points by fewer finished predictions, then join date", async () => {
    const supabase = mockSupabase({
      league_members: [
        { id: "m1", user_id: "u1", profile_name: "Alice", primary_nation_id: 1, joined_at: "2026-06-14T00:00:00Z" },
        { id: "m2", user_id: "u2", profile_name: "Bob", primary_nation_id: 2, joined_at: "2026-06-15T00:00:00Z" },
      ],
      predictions: [
        { user_id: "u1", points: 3 },
        { user_id: "u1", points: 3 },
        { user_id: "u2", points: 6 },
      ],
      nation_bonus_points: [],
      progression_bonus_points: [],
      swap_penalties: [],
    });

    const rows = await computeLeaderboard(supabase, "league-1", null, "round-1");

    expect(rows[0].user_id).toBe("u2");
    expect(rows[0].total_points).toBe(6);
    expect(rows[1].user_id).toBe("u1");
    expect(rows[1].total_points).toBe(6);
  });
});
