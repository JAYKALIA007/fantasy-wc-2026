import { FootballPlayer, Position, PresetKey, SQUAD_CONSTRAINTS } from "./types";

type SquadPlayer = FootballPlayer & { is_starting: boolean };

/**
 * Greedy constraint solver: pick 15 players satisfying all constraints.
 * Sorts candidates by a preset-specific score, then greedily fills positions.
 */
export function buildSquad(
  players: FootballPlayer[],
  preset: PresetKey
): SquadPlayer[] | null {
  const scored = players.map((p) => ({ ...p, score: scorePlayer(p, preset) }));
  scored.sort((a, b) => b.score - a.score);

  // Track how many of each position and nation we've used
  const posUsed: Record<Position, number> = { gk: 0, def: 0, mid: 0, fwd: 0 };
  const nationUsed = new Map<number, number>();

  const selected: (FootballPlayer & { score: number })[] = [];

  const canAdd = (p: FootballPlayer & { score: number }): boolean => {
    const pos = p.position;
    if (posUsed[pos] >= SQUAD_CONSTRAINTS.positions[pos]) return false;
    const currentNation = nationUsed.get(p.nation_id) ?? 0;
    if (currentNation >= SQUAD_CONSTRAINTS.maxPerNation) return false;
    return true;
  };

  const totalCost = () => selected.reduce((s, p) => s + p.current_price, 0);

  for (const p of scored) {
    if (selected.length >= 15) break;
    if (!canAdd(p)) continue;

    // Budget lookahead: don't pick if remaining budget can't fill remaining slots
    const remaining = 15 - selected.length - 1;
    const spent = totalCost() + p.current_price;
    const minFillCost = estimateMinFill(scored, selected, p, posUsed, nationUsed, remaining);
    if (spent + minFillCost > SQUAD_CONSTRAINTS.valueCap) continue;

    selected.push(p);
    posUsed[p.position]++;
    nationUsed.set(p.nation_id, (nationUsed.get(p.nation_id) ?? 0) + 1);
  }

  if (selected.length !== 15) return null;

  // Assign starting / bench
  const result: SquadPlayer[] = assignStarting(selected);
  return result;
}

function scorePlayer(p: FootballPlayer, preset: PresetKey): number {
  switch (preset) {
    case "bignames":
      return p.current_price;
    case "underdogs":
      // Penalise top teams (nation_id 1–10), reward cheapest value
      return p.nation_id <= 10 ? p.current_price * 0.3 : p.current_price * 1.5;
    case "mix":
      // Mix: high price players get a bonus but balance with variety
      return p.current_price > 9 ? p.current_price * 1.2 : p.current_price * 0.9;
    case "budget":
      // Prefer the cheapest players
      return 20 - p.current_price;
    case "form":
      // Simulate form: mid-price players from top-8 nations
      return p.current_price > 6 && p.current_price < 11 && p.nation_id <= 8
        ? p.current_price * 1.4
        : p.current_price * 0.8;
    default:
      return p.current_price;
  }
}

/**
 * Very rough lower bound: for the remaining positions needed, what is the cheapest possible fill?
 */
function estimateMinFill(
  allScored: (FootballPlayer & { score: number })[],
  selected: FootballPlayer[],
  candidate: FootballPlayer,
  posUsed: Record<Position, number>,
  nationUsed: Map<number, number>,
  remaining: number
): number {
  if (remaining <= 0) return 0;

  const selectedIds = new Set(selected.map((p) => p.id));
  selectedIds.add(candidate.id);

  const tempPosUsed = { ...posUsed };
  tempPosUsed[candidate.position]++;

  // Figure out which positions still need filling
  const posStillNeeded: Position[] = [];
  const positions: Position[] = ["gk", "def", "mid", "fwd"];
  for (const pos of positions) {
    const need = SQUAD_CONSTRAINTS.positions[pos] - tempPosUsed[pos];
    for (let i = 0; i < need; i++) posStillNeeded.push(pos);
  }

  // Find cheapest available for each needed position
  let minCost = 0;
  const tempNationUsed = new Map(nationUsed);
  for (const pos of posStillNeeded) {
    const cheapest = allScored.find(
      (p) =>
        !selectedIds.has(p.id) &&
        p.position === pos &&
        (tempNationUsed.get(p.nation_id) ?? 0) < SQUAD_CONSTRAINTS.maxPerNation
    );
    if (!cheapest) return Infinity; // No valid fill possible
    minCost += cheapest.current_price;
    selectedIds.add(cheapest.id);
    tempNationUsed.set(cheapest.nation_id, (tempNationUsed.get(cheapest.nation_id) ?? 0) + 1);
  }

  return minCost;
}

/**
 * Assign starting 11 vs bench 4. Ensures min constraints in starting XI.
 */
function assignStarting(players: FootballPlayer[]): SquadPlayer[] {
  const byPos: Record<Position, FootballPlayer[]> = { gk: [], def: [], mid: [], fwd: [] };
  for (const p of players) byPos[p.position].push(p);

  // Sort each position by price desc so we start the best
  for (const pos of Object.keys(byPos) as Position[]) {
    byPos[pos].sort((a, b) => b.current_price - a.current_price);
  }

  const starting: FootballPlayer[] = [];
  const bench: FootballPlayer[] = [];

  // Put min required in starting first
  const positions: Position[] = ["gk", "def", "mid", "fwd"];
  const minStart: Record<Position, number> = { gk: 1, def: 3, mid: 2, fwd: 1 };

  for (const pos of positions) {
    const minCount = minStart[pos];
    for (let i = 0; i < minCount; i++) {
      const player = byPos[pos].shift();
      if (player) starting.push(player);
    }
  }

  // Fill remaining starting slots (need 11 total) greedily
  const allRemaining = positions.flatMap((pos) => byPos[pos]);
  allRemaining.sort((a, b) => b.current_price - a.current_price);

  const maxStart: Record<Position, number> = {
    gk: SQUAD_CONSTRAINTS.positions.gk,
    def: SQUAD_CONSTRAINTS.positions.def - minStart.def,
    mid: SQUAD_CONSTRAINTS.positions.mid - minStart.mid,
    fwd: SQUAD_CONSTRAINTS.positions.fwd - minStart.fwd,
  };

  const startPosUsed: Record<Position, number> = {
    gk: minStart.gk,
    def: minStart.def,
    mid: minStart.mid,
    fwd: minStart.fwd,
  };

  for (const p of allRemaining) {
    if (starting.length >= 11) {
      bench.push(p);
      continue;
    }
    const available = maxStart[p.position];
    const used = startPosUsed[p.position] - minStart[p.position];
    if (used < available) {
      starting.push(p);
      startPosUsed[p.position]++;
    } else {
      bench.push(p);
    }
  }

  // If starting still < 11 due to position limits, fill bench players in
  while (starting.length < 11 && bench.length > 0) {
    starting.push(bench.shift()!);
  }

  const result: SquadPlayer[] = [
    ...starting.map((p) => ({ ...p, is_starting: true })),
    ...bench.map((p) => ({ ...p, is_starting: false })),
  ];

  return result;
}
