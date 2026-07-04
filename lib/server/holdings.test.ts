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

  it("does not carry a later round's holding back to an earlier round", () => {
    expect(holdingForRound(groupPick, [ro32Holding, r16Holding], ROUND_IDS.ro32)).toEqual({
      primary_nation_id: 10,
      secondary_nation_id: 20,
    });
  });

  it("carries the RO32 primary forward to R16 with the secondary dropped (collapse)", () => {
    expect(holdingForRound(groupPick, [ro32Holding], ROUND_IDS.r16)).toEqual({
      primary_nation_id: 10,
      secondary_nation_id: null,
    });
  });

  it("prefers an explicit R16 holding over the carried-forward RO32 one", () => {
    expect(holdingForRound(groupPick, [ro32Holding, r16Holding], ROUND_IDS.r16)).toEqual({
      primary_nation_id: 30,
      secondary_nation_id: null,
    });
  });

  it("carries forward and nulls the secondary at rounds beyond R16 (e.g. QF)", () => {
    expect(holdingForRound(groupPick, [ro32Holding], ROUND_IDS.qf)).toEqual({
      primary_nation_id: 10,
      secondary_nation_id: null,
    });
  });

  it("carries the group pick forward to R16 with the secondary dropped when never redrafted", () => {
    expect(holdingForRound(groupPick, [], ROUND_IDS.r16)).toEqual({
      primary_nation_id: 1,
      secondary_nation_id: null,
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
