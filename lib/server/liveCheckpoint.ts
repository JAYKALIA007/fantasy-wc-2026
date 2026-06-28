// Live checkpoint scoring engine (pure).
// Exact scoreline match → +2 pts. Any mismatch (including no prediction) → 0.

export interface CheckpointPrediction {
  predicted_home: number;
  predicted_away: number;
}

export interface CheckpointActual {
  actual_home: number;
  actual_away: number;
}

export function scoreLiveCheckpoint(
  pred: CheckpointPrediction,
  actual: CheckpointActual
): number {
  return pred.predicted_home === actual.actual_home &&
    pred.predicted_away === actual.actual_away
    ? 2
    : 0;
}
