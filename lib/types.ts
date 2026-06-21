// Shared domain types.
//
// Only genuinely identical, repo-wide shapes live here. Page-specific shapes
// (e.g. the predict-page Match, which carries scores/status/round) stay local
// to their files — consolidating divergent shapes would couple unrelated pages.

// Full nation shape, including FIFA ranking. Used wherever a nation card shows
// its rank (home next-match card, predict cards, onboarding lists).
export interface Nation {
  id: number;
  name: string;
  flag_code: string;
  fifa_ranking?: number | null;
}

// Minimal nation display shape — just enough to render a flag + name. Used in
// result rows, history, profile/player nation chips, and match headers.
export interface NationRef {
  name: string;
  flag_code: string;
}
