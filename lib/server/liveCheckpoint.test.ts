import { describe, it, expect } from "vitest";
import { scoreLiveCheckpoint } from "./liveCheckpoint";

describe("scoreLiveCheckpoint", () => {
  it("returns +2 on exact match", () => {
    expect(scoreLiveCheckpoint({ predicted_home: 1, predicted_away: 0 }, { actual_home: 1, actual_away: 0 })).toBe(2);
  });

  it("returns 0 on home score mismatch", () => {
    expect(scoreLiveCheckpoint({ predicted_home: 2, predicted_away: 0 }, { actual_home: 1, actual_away: 0 })).toBe(0);
  });

  it("returns 0 on away score mismatch", () => {
    expect(scoreLiveCheckpoint({ predicted_home: 1, predicted_away: 1 }, { actual_home: 1, actual_away: 0 })).toBe(0);
  });

  it("returns 0 on both scores wrong", () => {
    expect(scoreLiveCheckpoint({ predicted_home: 3, predicted_away: 2 }, { actual_home: 1, actual_away: 0 })).toBe(0);
  });

  it("returns +2 for 0-0 exact", () => {
    expect(scoreLiveCheckpoint({ predicted_home: 0, predicted_away: 0 }, { actual_home: 0, actual_away: 0 })).toBe(2);
  });

  it("returns +2 for pens tally exact (e.g. 4-3)", () => {
    expect(scoreLiveCheckpoint({ predicted_home: 4, predicted_away: 3 }, { actual_home: 4, actual_away: 3 })).toBe(2);
  });

  it("returns 0 for close-but-wrong pens tally", () => {
    expect(scoreLiveCheckpoint({ predicted_home: 4, predicted_away: 2 }, { actual_home: 4, actual_away: 3 })).toBe(0);
  });
});
