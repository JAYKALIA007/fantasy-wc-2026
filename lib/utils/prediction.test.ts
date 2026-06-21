import { describe, it, expect } from "vitest";
import { getOutcome } from "@/lib/utils/prediction";

describe("getOutcome", () => {
  it("returns 'exact' when the scoreline matches exactly", () => {
    expect(getOutcome(2, 1, 2, 1)).toBe("exact");
    expect(getOutcome(0, 0, 0, 0)).toBe("exact");
  });

  it("returns 'result' when the winner/draw is right but the score is wrong", () => {
    expect(getOutcome(2, 1, 3, 0)).toBe("result"); // both home wins
    expect(getOutcome(0, 2, 1, 3)).toBe("result"); // both away wins
    expect(getOutcome(1, 1, 2, 2)).toBe("result"); // both draws
  });

  it("returns 'miss' when the outcome differs", () => {
    expect(getOutcome(2, 1, 1, 2)).toBe("miss"); // predicted home, was away
    expect(getOutcome(1, 1, 2, 0)).toBe("miss"); // predicted draw, was home
    expect(getOutcome(2, 0, 1, 1)).toBe("miss"); // predicted home, was draw
  });
});
