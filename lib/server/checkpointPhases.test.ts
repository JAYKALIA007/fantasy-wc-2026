import { describe, it, expect } from "vitest";
import { computePhaseTransitions, type StoredPhase } from "./checkpointPhases";
import type { DetectedState } from "./espnPhase";

function detected(partial: Partial<DetectedState> & { stage: DetectedState["stage"] }): DetectedState {
  return {
    home: 0,
    away: 0,
    shootoutHome: null,
    shootoutAway: null,
    period: 0,
    isComplete: false,
    decidedInRegulation: false,
    ...partial,
  };
}

const NONE: StoredPhase[] = [];
const phase = (phase: StoredPhase["phase"], status: StoredPhase["status"]): StoredPhase => ({
  phase, status, actual_home: null, actual_away: null,
});

describe("computePhaseTransitions", () => {
  it("pre-match opens h1 (not a live push)", () => {
    const a = computePhaseTransitions(NONE, detected({ stage: "pre" }));
    expect(a).toEqual([{ phase: "h1", status: "open", opened: false }]);
  });

  it("kickoff closes h1 and opens h2 as a live window", () => {
    const a = computePhaseTransitions([phase("h1", "open")], detected({ stage: "first_half", home: 1, away: 0 }));
    expect(a).toContainEqual({ phase: "h1", status: "closed" });
    expect(a).toContainEqual({ phase: "h2", status: "open", opened: true });
  });

  it("halftime scores h1 with the current score", () => {
    const a = computePhaseTransitions([phase("h1", "closed"), phase("h2", "open")], detected({ stage: "halftime", home: 2, away: 1 }));
    expect(a).toContainEqual({ phase: "h1", status: "scored", actual_home: 2, actual_away: 1 });
  });

  it("2nd half closes h2", () => {
    const a = computePhaseTransitions([phase("h1", "scored"), phase("h2", "open")], detected({ stage: "second_half", home: 2, away: 1 }));
    expect(a).toContainEqual({ phase: "h2", status: "closed" });
  });

  it("complete (decided in regulation) scores h2 with the final score", () => {
    const a = computePhaseTransitions(
      [phase("h1", "scored"), phase("h2", "closed")],
      detected({ stage: "complete", home: 3, away: 1, isComplete: true, decidedInRegulation: true, period: 2 })
    );
    expect(a).toContainEqual({ phase: "h2", status: "scored", actual_home: 3, actual_away: 1 });
  });

  it("does NOT open et/pens when the match was decided in regulation", () => {
    const a = computePhaseTransitions(
      [phase("h1", "scored"), phase("h2", "closed")],
      detected({ stage: "complete", home: 3, away: 1, isComplete: true, decidedInRegulation: true, period: 2 })
    );
    expect(a.some((x) => x.phase === "et" && x.status === "open")).toBe(false);
    expect(a.some((x) => x.phase === "pens")).toBe(false);
  });

  it("complete via shootout scores et (level goals) and pens (tally)", () => {
    const a = computePhaseTransitions(
      [phase("et", "closed"), phase("pens", "closed")],
      detected({ stage: "complete", home: 1, away: 1, shootoutHome: 4, shootoutAway: 3, isComplete: true, period: 5 })
    );
    expect(a).toContainEqual({ phase: "et", status: "scored", actual_home: 1, actual_away: 1 });
    expect(a).toContainEqual({ phase: "pens", status: "scored", actual_home: 4, actual_away: 3 });
  });

  it("complete decided in ET (no shootout) scores et with the final score", () => {
    const a = computePhaseTransitions(
      [phase("et", "closed")],
      detected({ stage: "complete", home: 2, away: 1, isComplete: true, period: 4 })
    );
    expect(a).toContainEqual({ phase: "et", status: "scored", actual_home: 2, actual_away: 1 });
  });

  it("is idempotent — re-running with already-applied state yields no actions", () => {
    const stored = [phase("h1", "scored"), phase("h2", "scored")];
    const a = computePhaseTransitions(stored, detected({ stage: "complete", home: 3, away: 1, isComplete: true, decidedInRegulation: true, period: 2 }));
    expect(a).toEqual([]);
  });

  it("does not re-open an already-open h2 at kickoff", () => {
    const a = computePhaseTransitions([phase("h1", "closed"), phase("h2", "open")], detected({ stage: "first_half", home: 0, away: 0 }));
    expect(a.some((x) => x.phase === "h2")).toBe(false);
  });

  it("shootout stage closes an open pens window and scores et", () => {
    const a = computePhaseTransitions(
      [phase("et", "closed"), phase("pens", "open")],
      detected({ stage: "shootout", home: 1, away: 1, period: 5 })
    );
    expect(a).toContainEqual({ phase: "pens", status: "closed" });
    expect(a).toContainEqual({ phase: "et", status: "scored", actual_home: 1, actual_away: 1 });
  });
});
