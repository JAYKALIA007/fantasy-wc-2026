export type Position = "gk" | "def" | "mid" | "fwd";

export interface FootballPlayer {
  id: number;
  name: string;
  nation_id: number;
  position: Position;
  current_price: number;
  initial_price: number;
  flag_code?: string;
}

export interface SquadSlot {
  player: FootballPlayer | null;
  is_starting: boolean;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export const SQUAD_CONSTRAINTS = {
  total: 15,
  starting: 11,
  bench: 4,
  positions: { gk: 2, def: 5, mid: 5, fwd: 3 } as Record<Position, number>,
  startingMin: { gk: 1, def: 3, mid: 2, fwd: 1 } as Record<Position, number>,
  maxPerNation: 3,
  valueCap: 100.0,
} as const;

export type PresetKey = "bignames" | "underdogs" | "mix" | "budget" | "form";

export interface AutoBuildPreset {
  key: PresetKey;
  label: string;
  description: string;
  stat: string;
}

export const AUTO_BUILD_PRESETS: AutoBuildPreset[] = [
  { key: "bignames", label: "Big names", description: "Top-rated stars, max price", stat: "Avg 87★" },
  { key: "underdogs", label: "Underdogs", description: "Nations ranked 10+, best value", stat: "Max value" },
  { key: "mix", label: "Mix", description: "Stars + smart value picks", stat: "Recommended" },
  { key: "budget", label: "Budget", description: "Most bang for your buck", stat: "Save cap" },
  { key: "form", label: "Form-based", description: "Players hot in the current tournament", stat: "Trending ↗" },
];
