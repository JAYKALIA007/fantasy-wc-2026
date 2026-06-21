// READ-ONLY inspection of live DB state for the backfill task.
// Run: node --env-file=.env.local scripts/inspect-db.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: matches, error } = await supabase
  .from("matches")
  .select(
    "id, kickoff_time, status, home_score, away_score, group_label, home_nation:home_nation_id(name), away_nation:away_nation_id(name)"
  )
  .order("kickoff_time", { ascending: true });

if (error) {
  console.error("matches query failed:", error.message);
  process.exit(1);
}

const { data: bonuses } = await supabase.from("nation_bonus_points").select("match_id");
const bonusCount = {};
for (const b of bonuses ?? []) bonusCount[b.match_id] = (bonusCount[b.match_id] ?? 0) + 1;

const { data: preds } = await supabase.from("predictions").select("match_id");
const predCount = {};
for (const p of preds ?? []) predCount[p.match_id] = (predCount[p.match_id] ?? 0) + 1;

const name = (n) => (Array.isArray(n) ? n[0]?.name : n?.name) ?? "?";

console.log(`total matches: ${matches.length}\n`);
let i = 0;
for (const m of matches) {
  i++;
  const s =
    m.home_score == null ? "  vs " : `${m.home_score}-${m.away_score}`;
  console.log(
    `${String(i).padStart(2)}. #${m.id}  ${m.kickoff_time?.slice(0, 10)}  ` +
      `${name(m.home_nation).padEnd(14)} ${s} ${name(m.away_nation).padEnd(14)} ` +
      `[${m.status.padEnd(9)}]  bonuses:${bonusCount[m.id] ?? 0}  preds:${predCount[m.id] ?? 0}`
  );
}
