import { describe, it, expect } from "vitest";
import { getOpenPhasesToSubmit } from "./predict-client";
import type { CheckpointPhase } from "./page";

function phase(p: string, status: CheckpointPhase["status"]): CheckpointPhase {
  return { phase: p, status, actual_home: null, actual_away: null };
}

describe("getOpenPhasesToSubmit", () => {
  it("returns only open phases — closed/scored phases are skipped", () => {
    // h1 closed after kickoff, h2 still open during first half
    const phases = [phase("h1", "closed"), phase("h2", "open")];
    const scores = { h1: [1, 0] as [number, number], h2: [2, 1] as [number, number] };
    const result = getOpenPhasesToSubmit(phases, scores);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ phase: "h2", home: 2, away: 1 });
  });

  it("returns both phases when h1 and h2 are both open pre-kickoff", () => {
    const phases = [phase("h1", "open"), phase("h2", "open")];
    const scores = { h1: [1, 0] as [number, number], h2: [3, 1] as [number, number] };
    const result = getOpenPhasesToSubmit(phases, scores);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.phase)).toContain("h1");
    expect(result.map((r) => r.phase)).toContain("h2");
  });

  it("returns empty list when all phases are closed or scored", () => {
    const phases = [phase("h1", "scored"), phase("h2", "scored")];
    const scores = { h1: [1, 0] as [number, number], h2: [2, 1] as [number, number] };
    expect(getOpenPhasesToSubmit(phases, scores)).toHaveLength(0);
  });

  it("defaults to 0-0 when no score has been set for an open phase", () => {
    const phases = [phase("h2", "open")];
    const result = getOpenPhasesToSubmit(phases, {});
    expect(result[0]).toMatchObject({ phase: "h2", home: 0, away: 0 });
  });
});
