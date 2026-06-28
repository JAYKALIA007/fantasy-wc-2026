import { describe, it, expect } from "vitest";
import { computeRedraft, SWAP_PENALTY } from "@/lib/server/redraft";

const top12 = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const other20 = new Set([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);

describe("computeRedraft — RO32", () => {
  const baseline = { primary_nation_id: 2, secondary_nation_id: 20 };
  const pools = { primary: top12, secondary: other20 };

  it("keeps both — no penalty", () => {
    const r = computeRedraft("ro32", baseline, { primary_nation_id: 2, secondary_nation_id: 20 }, pools);
    expect(r.ok).toBe(true);
    expect(r.penalties).toEqual([]);
    expect(r.holding.primary_swapped).toBe(false);
    expect(r.holding.secondary_swapped).toBe(false);
  });

  it("swaps primary — charges −5 once", () => {
    const r = computeRedraft("ro32", baseline, { primary_nation_id: 5, secondary_nation_id: 20 }, pools);
    expect(r.ok).toBe(true);
    expect(r.penalties).toEqual([{ pick_type: "primary", amount: 5 }]);
    expect(r.holding.primary_swapped).toBe(true);
  });

  it("switches secondary — free, tracked", () => {
    const r = computeRedraft("ro32", baseline, { primary_nation_id: 2, secondary_nation_id: 30 }, pools);
    expect(r.ok).toBe(true);
    expect(r.penalties).toEqual([]);
    expect(r.holding.secondary_swapped).toBe(true);
    expect(r.holding.secondary_nation_id).toBe(30);
  });

  it("rejects a primary outside the top-12 pool", () => {
    const r = computeRedraft("ro32", baseline, { primary_nation_id: 20, secondary_nation_id: 30 }, pools);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/primary/i);
  });

  it("rejects a secondary outside the 20 pool", () => {
    const r = computeRedraft("ro32", baseline, { primary_nation_id: 2, secondary_nation_id: 99 }, pools);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/secondary/i);
  });

  it("requires a secondary at RO32", () => {
    const r = computeRedraft("ro32", baseline, { primary_nation_id: 2 }, pools);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/required/i);
  });

  it("end-state diff: swap back to original within the window is free", () => {
    // Caller re-submits with the ORIGINAL primary after fiddling — baseline is
    // unchanged (always the carried-in pick), so no penalty.
    const r = computeRedraft("ro32", baseline, { primary_nation_id: 2, secondary_nation_id: 20 }, pools);
    expect(r.penalties).toEqual([]);
  });
});

describe("computeRedraft — single-team rounds", () => {
  const pools = { primary: new Set([1, 2, 3, 4, 5, 6, 7, 8]) };

  it("escalating ladder per round", () => {
    expect(SWAP_PENALTY.r16).toBe(5);
    expect(SWAP_PENALTY.qf).toBe(8);
    expect(SWAP_PENALTY.sf).toBe(10);
    expect(SWAP_PENALTY.final).toBe(12);
  });

  it("keeps single team — free", () => {
    const r = computeRedraft("qf", { primary_nation_id: 3, secondary_nation_id: null }, { primary_nation_id: 3 }, pools);
    expect(r.ok).toBe(true);
    expect(r.penalties).toEqual([]);
    expect(r.holding.secondary_nation_id).toBeNull();
  });

  it("swaps single team at QF — charges −8", () => {
    const r = computeRedraft("qf", { primary_nation_id: 3, secondary_nation_id: null }, { primary_nation_id: 7 }, pools);
    expect(r.penalties).toEqual([{ pick_type: "primary", amount: 8 }]);
  });

  it("ignores any secondary submitted at a single-team round", () => {
    const r = computeRedraft("sf", { primary_nation_id: 1, secondary_nation_id: null }, { primary_nation_id: 1, secondary_nation_id: 5 }, pools);
    expect(r.ok).toBe(true);
    expect(r.holding.secondary_nation_id).toBeNull();
    expect(r.penalties).toEqual([]);
  });
});
