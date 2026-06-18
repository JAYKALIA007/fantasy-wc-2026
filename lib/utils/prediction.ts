export function getOutcome(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number
): "exact" | "result" | "miss" {
  if (predictedHome === actualHome && predictedAway === actualAway) return "exact";
  const pred = predictedHome > predictedAway ? "H" : predictedHome < predictedAway ? "A" : "D";
  const actual = actualHome > actualAway ? "H" : actualHome < actualAway ? "A" : "D";
  return pred === actual ? "result" : "miss";
}
