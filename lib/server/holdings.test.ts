import { describe, it, expect } from "vitest";
import { holdingForRound, currentHolding, type HoldingRow } from "@/lib/server/holdings";
import { ROUND_IDS } from "@/lib/constants";

const groupPick = { primary_nation_id: 1, secondary_nation_id: 2 };

const ro32Holding: HoldingRow = {
  round_id: ROUND_IDS.ro32,
  primary_nation_id: 10,
  secondary_nation_id: 20,
};
const r16Holding: HoldingRow = {
  round_id: ROUND_IDS.r16,
  primary_nation_id: 30,
  secondary_nation_id: null,
};

describe("holdingForRound", () => {
  it("returns the holding for the requested round", () => {
    expect(holdingForRound(groupPick, [ro32Holding], ROUND_IDS.ro32)).toEqual({
      primary_nation_id: 10,
      secondary_nation_id: 20,
    });
  });

  it("falls back to the group pick when the member has no holding for that round", () => {
    expect(holdingForRound(groupPick, [], ROUND_IDS.ro32)).toEqual(groupPick);
  });

  it("falls back to the group pick for the group stage itself", () => {
    expect(holdingForRound(groupPick, [ro32Holding], ROUND_IDS.group_stage)).toEqual(groupPick);
  });

  it("picks the exact round, not the latest", () => {
    expect(holdingForRound(groupPick, [ro32Holding, r16Holding], ROUND_IDS.ro32)).toEqual({
      primary_nation_id: 10,
      secondary_nation_id: 20,
    });
  });
});

describe("currentHolding", () => {
  it("returns the group pick when there are no holdings", () => {
    expect(currentHolding(groupPick, [])).toEqual(groupPick);
  });

  it("returns the RO32 holding once a member redrafts", () => {
    expect(currentHolding(groupPick, [ro32Holding])).toEqual({
      primary_nation_id: 10,
      secondary_nation_id: 20,
    });
  });

  it("returns the latest holding by round progression regardless of array order", () => {
    expect(currentHolding(groupPick, [r16Holding, ro32Holding])).toEqual({
      primary_nation_id: 30,
      secondary_nation_id: null,
    });
  });
});
