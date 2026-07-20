// End-of-season superlatives, computed league-wide (admin excluded). Surfaced on
// the home page once the tournament is over. Ties share the award (co-winners).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

export interface SeasonAward {
  emoji: string;
  title: string;
  sub: string;
  winners: string; // one name, "A & B", or "A +N" for many
  stat: string; // e.g. "16 exact"
}

const PAGE = 1000;
async function fetchAll<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  make: () => any
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

// The max-scoring members (co-winners on a tie). Returns null if nobody scored.
function leaders(counts: Map<string, number>, nameByUser: Map<string, string>): { winners: string; stat: number } | null {
  let max = 0;
  for (const [u, c] of counts) if (nameByUser.has(u) && c > max) max = c;
  if (max <= 0) return null;
  const names = [...counts.entries()]
    .filter(([u, c]) => nameByUser.has(u) && c === max)
    .map(([u]) => nameByUser.get(u) as string)
    .sort();
  const winners = names.length <= 2 ? names.join(" & ") : `${names[0]} +${names.length - 1}`;
  return { winners, stat: max };
}

export async function computeSeasonAwards(
  supabase: SupabaseLike,
  leagueId: string,
  adminUserId: string | null
): Promise<SeasonAward[]> {
  const { data: mem } = await supabase.from("league_members").select("user_id, profile_name").eq("league_id", leagueId);
  const nameByUser = new Map<string, string>();
  for (const m of mem ?? []) if (m.user_id !== adminUserId) nameByUser.set(m.user_id as string, m.profile_name as string);

  // Predictions (finished matches only): exact = +3, correct = +1.
  const preds = await fetchAll<{ user_id: string; points: number | null }>(() =>
    supabase.from("predictions").select("user_id, points, matches!inner(status)").eq("league_id", leagueId).eq("matches.status", "finished")
  );
  const exact = new Map<string, number>();
  const correct = new Map<string, number>();
  for (const p of preds) {
    const pts = p.points ?? 0;
    if (pts >= 3) inc(exact, p.user_id);
    if (pts >= 1) inc(correct, p.user_id);
  }

  // Live checkpoint hits (any scoring HT/FT/ET/pens pick).
  const cps = await fetchAll<{ user_id: string; points: number | null }>(() =>
    supabase.from("live_checkpoint_predictions").select("user_id, points").eq("league_id", leagueId).not("points", "is", null)
  );
  const cpHits = new Map<string, number>();
  for (const c of cps) if ((c.points ?? 0) > 0) inc(cpHits, c.user_id);

  // Bracket calls: pick's advancer matches the match winner (derived from score).
  const { data: matches } = await supabase.from("matches").select("id, home_nation_id, away_nation_id, home_score, away_score").eq("status", "finished");
  const winnerByMatch = new Map<number, number | null>();
  for (const m of matches ?? []) {
    const hs = m.home_score as number, as = m.away_score as number;
    winnerByMatch.set(m.id as number, hs > as ? (m.home_nation_id as number) : as > hs ? (m.away_nation_id as number) : null);
  }
  const bp = await fetchAll<{ user_id: string; match_id: number; advancer_nation_id: number }>(() =>
    supabase.from("ro32_bracket_picks").select("user_id, match_id, advancer_nation_id").eq("league_id", leagueId)
  );
  const oracle = new Map<string, number>();
  for (const p of bp) if (winnerByMatch.get(p.match_id) === p.advancer_nation_id) inc(oracle, p.user_id);

  // Goalscorer wagers lost.
  const wg = await fetchAll<{ user_id: string; status: string }>(() =>
    supabase.from("goalscorer_wagers").select("user_id, status").eq("league_id", leagueId)
  );
  const lost = new Map<string, number>();
  for (const w of wg) if (w.status === "lost") inc(lost, w.user_id);

  const awards: SeasonAward[] = [];
  const add = (emoji: string, title: string, sub: string, counts: Map<string, number>, unit: string) => {
    const l = leaders(counts, nameByUser);
    if (l) awards.push({ emoji, title, sub, winners: l.winners, stat: `${l.stat} ${unit}` });
  };
  add("🎯", "Sharpshooter", "Most exact scorelines", exact, "exact");
  add("✅", "Mr. Consistent", "Most correct results", correct, "correct");
  add("🔮", "The Oracle", "Best bracket calls", oracle, "right");
  add("⚡", "Checkpoint King", "Most HT/FT hits", cpHits, "hits");
  add("😅", "Heartbreak", "Most wagers lost", lost, "lost");
  return awards;
}
