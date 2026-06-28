export const ROUND_ID = "a0000000-0000-0000-0000-000000000001";

// Knockout round UUIDs (seeded in migration 020 / 022).
export const ROUND_IDS = {
  group_stage: "a0000000-0000-0000-0000-000000000001",
  ro32: "a0000000-0000-0000-0000-000000000003",
  r16: "a0000000-0000-0000-0000-000000000002",
  qf: "a0000000-0000-0000-0000-000000000004",
  sf: "a0000000-0000-0000-0000-000000000005",
  final: "a0000000-0000-0000-0000-000000000006",
  bronze: "a0000000-0000-0000-0000-000000000008",
} as const;

// Size of the RO32 re-draft primary pool (top N survivors by FIFA ranking).
export const RO32_PRIMARY_POOL_SIZE = 12;

// Bracket picks lock this long before the first knockout match kicks off
// (30 min → midnight 00:00 IST when the first match is 00:30 IST), matching the
// re-draft window close.
export const BRACKET_LOCK_LEAD_MS = 30 * 60 * 1000;
