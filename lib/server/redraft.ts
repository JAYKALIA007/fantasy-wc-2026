// Re-draft penalty engine (pure). Given what a member carried INTO a round and
// what they submitted, returns the penalties owed and the holdings to persist.
//
// Penalty model is END-STATE DIFF, charged once: penalty depends only on whether
// the submitted team differs from the carried-in baseline, never on how many
// times they fiddled. Re-submitting recomputes from scratch (the caller clears
// and re-writes this round's swap_penalties), so it is idempotent.
//
// RO32 is the re-draft: two teams. Primary swap costs PENALTY.ro32 (−3);
// secondary switch is FREE (tracked but never charged). RO16 onward is a single
// team on the escalating ladder. See docs/knockout-reassignment-spec.md §3.

export const SWAP_PENALTY = {
  ro32: 3, // primary only; secondary is free at RO32
  r16: 5,
  qf: 8,
  sf: 10,
  final: 12,
} as const;

export type RedraftRound = keyof typeof SWAP_PENALTY;

export interface RedraftBaseline {
  primary_nation_id: number | null;
  secondary_nation_id: number | null; // ignored for single-team rounds
}

export interface RedraftSubmission {
  primary_nation_id: number;
  secondary_nation_id?: number | null; // required at RO32, ignored otherwise
}

export interface RedraftPenalty {
  pick_type: "primary" | "secondary";
  amount: number;
}

export interface RedraftResult {
  ok: boolean;
  error?: string;
  penalties: RedraftPenalty[];
  holding: {
    primary_nation_id: number;
    secondary_nation_id: number | null;
    primary_swapped: boolean;
    secondary_swapped: boolean;
  };
}

export function computeRedraft(
  round: RedraftRound,
  baseline: RedraftBaseline,
  submission: RedraftSubmission,
  pools: { primary: Set<number>; secondary?: Set<number> }
): RedraftResult {
  const fail = (error: string): RedraftResult => ({
    ok: false,
    error,
    penalties: [],
    holding: { primary_nation_id: submission.primary_nation_id, secondary_nation_id: null, primary_swapped: false, secondary_swapped: false },
  });

  if (!pools.primary.has(submission.primary_nation_id)) {
    return fail("Primary pick is not in the allowed pool");
  }

  const primarySwapped = submission.primary_nation_id !== baseline.primary_nation_id;
  const penalties: RedraftPenalty[] = [];
  if (primarySwapped) {
    penalties.push({ pick_type: "primary", amount: SWAP_PENALTY[round] });
  }

  if (round === "ro32") {
    const sec = submission.secondary_nation_id;
    if (sec == null) return fail("Secondary pick is required at the RO32 re-draft");
    if (!pools.secondary || !pools.secondary.has(sec)) {
      return fail("Secondary pick is not in the allowed pool");
    }
    const secondarySwapped = sec !== baseline.secondary_nation_id;
    // Secondary switch is free at RO32 — tracked, never charged.
    return {
      ok: true,
      penalties,
      holding: {
        primary_nation_id: submission.primary_nation_id,
        secondary_nation_id: sec,
        primary_swapped: primarySwapped,
        secondary_swapped: secondarySwapped,
      },
    };
  }

  // Single-team rounds (RO16 → Final): no secondary.
  return {
    ok: true,
    penalties,
    holding: {
      primary_nation_id: submission.primary_nation_id,
      secondary_nation_id: null,
      primary_swapped: primarySwapped,
      secondary_swapped: false,
    },
  };
}
