import { describe, it, expect } from "vitest";
import { mapEspnCompetition } from "./espnPhase";

// Fixtures shaped like the real fifa.world scoreboard payload (captured 2026).
function comp(opts: {
  state: string;
  completed?: boolean;
  description?: string;
  period?: number | null;
  homeScore: string | number;
  awayScore: string | number;
  homeShootout?: number | null;
  awayShootout?: number | null;
}) {
  return {
    competitors: [
      { homeAway: "home", score: opts.homeScore, shootoutScore: opts.homeShootout ?? null },
      { homeAway: "away", score: opts.awayScore, shootoutScore: opts.awayShootout ?? null },
    ],
    status: {
      type: { state: opts.state, completed: opts.completed ?? false, description: opts.description ?? "" },
      period: opts.period ?? null,
    },
  };
}

describe("mapEspnCompetition", () => {
  it("pre-match → pre", () => {
    const r = mapEspnCompetition(comp({ state: "pre", description: "Scheduled", homeScore: 0, awayScore: 0 }))!;
    expect(r.stage).toBe("pre");
    expect(r.isComplete).toBe(false);
  });

  it("1st half in progress → first_half", () => {
    const r = mapEspnCompetition(comp({ state: "in", description: "1st Half", period: 1, homeScore: 1, awayScore: 0 }))!;
    expect(r.stage).toBe("first_half");
    expect(r.home).toBe(1);
    expect(r.away).toBe(0);
  });

  it("halftime detected by description → halftime", () => {
    const r = mapEspnCompetition(comp({ state: "in", description: "Halftime", period: 1, homeScore: 1, awayScore: 1 }))!;
    expect(r.stage).toBe("halftime");
  });

  it("2nd half in progress → second_half", () => {
    const r = mapEspnCompetition(comp({ state: "in", description: "2nd Half", period: 2, homeScore: 2, awayScore: 1 }))!;
    expect(r.stage).toBe("second_half");
  });

  it("full time decided in regulation → complete + decidedInRegulation", () => {
    const r = mapEspnCompetition(comp({ state: "post", completed: true, description: "Full Time", period: 2, homeScore: 5, awayScore: 1 }))!;
    expect(r.stage).toBe("complete");
    expect(r.isComplete).toBe(true);
    expect(r.decidedInRegulation).toBe(true);
  });

  it("extra time in progress (period 3) → extra_time", () => {
    const r = mapEspnCompetition(comp({ state: "in", description: "1st Half Extra Time", period: 3, homeScore: 1, awayScore: 1 }))!;
    expect(r.stage).toBe("extra_time");
  });

  it("penalty shootout in progress (period 5) → shootout", () => {
    const r = mapEspnCompetition(comp({ state: "in", description: "Penalties", period: 5, homeScore: 1, awayScore: 1, homeShootout: 2, awayShootout: 1 }))!;
    expect(r.stage).toBe("shootout");
    expect(r.shootoutHome).toBe(2);
    expect(r.shootoutAway).toBe(1);
  });

  it("completed after ET is NOT decidedInRegulation", () => {
    const r = mapEspnCompetition(comp({ state: "post", completed: true, description: "Full Time", period: 4, homeScore: 2, awayScore: 1 }))!;
    expect(r.stage).toBe("complete");
    expect(r.decidedInRegulation).toBe(false);
  });

  it("completed after shootout carries shootout scores, not decidedInRegulation", () => {
    const r = mapEspnCompetition(comp({ state: "post", completed: true, description: "Full Time", period: 5, homeScore: 1, awayScore: 1, homeShootout: 4, awayShootout: 3 }))!;
    expect(r.stage).toBe("complete");
    expect(r.decidedInRegulation).toBe(false);
    expect(r.shootoutHome).toBe(4);
    expect(r.shootoutAway).toBe(3);
  });

  it("missing competitors → null", () => {
    expect(mapEspnCompetition({ competitors: [], status: { type: { state: "in" } } })).toBeNull();
  });
});
