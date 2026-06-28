// Phase state machine (pure). Given the stored checkpoint-phase rows for a match
// and the freshly detected match state (from the ESPN phase-mapper), produces the
// set of window transitions to apply: open / close / snapshot-and-score.
//
// Window lifecycle (see issues/prd.md "Window lifecycle"):
//   h1  predicts the half-time score; opens pre-match (upfront), closes at
//       kickoff, its boundary (actual) is captured at the half-time break.
//   h2  predicts the 90' score; opens pre-match (upfront, alongside h1), stays
//       editable through the first half AND the half-time break, closes at
//       2nd-half kickoff, boundary captured at full-time / start of extra time.
//   et  predicts the 120' score; opens at end of 90' ONLY if level, closes at
//       ET start, boundary captured at end of ET.
//   pens predicts the shootout tally; opens at end of ET ONLY if level, closes
//       at shootout start, boundary = the final shootout tally.
//
// et/pens are created lazily: they auto-open when ESPN surfaces the end-of-90'
// / end-of-ET break with the match still level (admin "Open" stays as a backup
// if ESPN never exposes that brief break state). All transitions are idempotent:
// an action is emitted only when it changes the stored status, so re-running with
// the same detected state is a no-op.

import type { DetectedState } from "./espnPhase";
import { scoreLiveCheckpoint } from "./liveCheckpoint";

export type Phase = "h1" | "h2" | "et" | "pens";
export type PhaseStatus = "pending" | "open" | "closed" | "scored";

export interface StoredPhase {
  phase: Phase;
  status: PhaseStatus;
  actual_home: number | null;
  actual_away: number | null;
}

export interface PhaseAction {
  phase: Phase;
  status: PhaseStatus; // target status
  actual_home?: number; // set on score actions
  actual_away?: number;
  opened?: boolean; // true when this action opens a LIVE window (push trigger: h2/et/pens)
}

export function computePhaseTransitions(
  stored: StoredPhase[],
  detected: DetectedState
): PhaseAction[] {
  const byPhase = new Map<Phase, StoredPhase>();
  for (const s of stored) byPhase.set(s.phase, s);

  const statusOf = (p: Phase): PhaseStatus => byPhase.get(p)?.status ?? "pending";
  const actions: PhaseAction[] = [];

  const open = (phase: Phase, live: boolean) => {
    if (statusOf(phase) === "pending") actions.push({ phase, status: "open", opened: live });
  };
  const close = (phase: Phase) => {
    if (statusOf(phase) === "open") actions.push({ phase, status: "closed" });
  };
  const score = (phase: Phase, home: number, away: number) => {
    if (statusOf(phase) !== "scored") {
      actions.push({ phase, status: "scored", actual_home: home, actual_away: away });
    }
  };

  const { stage, home, away, shootoutHome, shootoutAway, decidedInRegulation } = detected;

  switch (stage) {
    case "pre":
      // Both h1 and h2 are shown upfront, before kickoff (no per-phase push).
      open("h1", false);
      open("h2", false);
      break;

    case "first_half":
      close("h1"); // kickoff passed — HT prediction window closes (boundary at HT)
      open("h2", false); // fallback if pre was missed; quiet (h2 is an upfront window)
      break;

    case "halftime":
      score("h1", home, away); // the HT score is final now
      // h2 (90' prediction) deliberately stays OPEN through the half-time break —
      // players can adjust it during the interval; it locks at 2nd-half kickoff.
      break;

    case "second_half":
      close("h1"); // recovery: if HT was missed, still close (admin scores)
      close("h2"); // 2nd half kicked off — lock the 90' prediction now
      break;

    case "end_regulation":
      // 90' over and the match is LEVEL → going to extra time. Snapshot the 90'
      // (h2) boundary and open the et window so players predict the 120' score
      // BEFORE extra time is played. Admin "Open et" remains the backup if ESPN
      // never surfaces this break state.
      close("h2"); // no-op if already locked at half-time
      score("h2", home, away); // 90' boundary is final now
      if (home === away) open("et", true); // live window → push
      break;

    case "extra_time":
      // Best-effort recovery: if end_regulation was missed, the cumulative score
      // at ET start still ≈ the 90' score.
      score("h2", home, away);
      close("et"); // ET started — close the et window
      break;

    case "end_et":
      // 120' over and still LEVEL → going to penalties. Snapshot the 120' (et)
      // boundary and open the pens window before the shootout.
      score("et", home, away); // 120' boundary is final now
      if (home === away) open("pens", true); // live window → push
      break;

    case "shootout":
      // Best-effort recovery: at shootout start the cumulative score == the 120'.
      score("et", home, away);
      close("pens"); // shootout started — close the pens window
      break;

    case "complete":
      if (decidedInRegulation) {
        score("h2", home, away); // final == 90' score
      } else if (shootoutHome != null && shootoutAway != null) {
        // Decided on penalties: current goals == 120' (et) boundary; pens = tally.
        score("et", home, away);
        score("pens", shootoutHome, shootoutAway);
      } else {
        // Decided in extra time (no shootout): final == 120' (et) boundary.
        score("et", home, away);
      }
      // Sweep any windows still open at the final whistle.
      close("h1");
      close("h2");
      close("et");
      close("pens");
      break;
  }

  return actions;
}

// Convenience: compute points for a single prediction against a scored phase.
// (Thin re-export so cron callers have one import surface.)
export { scoreLiveCheckpoint };
