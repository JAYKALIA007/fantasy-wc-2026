// Reconcile nation bonuses: insert any MISSING bonus rows across ALL finished
// matches (e.g. members who joined after a match was scored). Insert-only —
// never deletes or modifies existing rows, never fires notifications. Idempotent:
// re-running once clean inserts nothing. Generalizes the one-off backfill.
//
// Dry run (default):
//   node --env-file=.env.local --experimental-strip-types scripts/reconcile-nation-bonus.ts
// Commit:
//   node --env-file=.env.local --experimental-strip-types scripts/reconcile-nation-bonus.ts --write

import { createClient } from "@supabase/supabase-js";
import { computeNationBonus, type MemberPicks, type MatchResult, type NationBonusRow } from "../lib/server/nationBonus.ts";

const WRITE = process.argv.includes("--write");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const { data: members } = await supabase
  .from("league_members")
  .select("id, profile_name, primary_nation_id, secondary_nation_id");
const memberName = new Map<string, string>();
const memberPicks: MemberPicks[] = [];
for (const m of members ?? []) {
  memberName.set(m.id as string, m.profile_name as string);
  memberPicks.push({
    league_member_id: m.id as string,
    primary_nation_id: m.primary_nation_id as number | null,
    secondary_nation_id: m.secondary_nation_id as number | null,
  });
}

const { data: nations } = await supabase.from("nations").select("id, name");
const nationName = new Map<number, string>();
for (const n of nations ?? []) nationName.set(n.id as number, n.name as string);

const { data: matches } = await supabase
  .from("matches")
  .select("id, home_nation_id, away_nation_id, home_score, away_score, status")
  .eq("status", "finished");

const { data: actualRows } = await supabase
  .from("nation_bonus_points")
  .select("league_member_id, match_id, nation_id, pick_type");
const keyOf = (r: { league_member_id: string; match_id: number; nation_id: number; pick_type: string }) =>
  `${r.league_member_id}|${r.match_id}|${r.nation_id}|${r.pick_type}`;
const actual = new Set((actualRows ?? []).map((r) => keyOf(r as never)));

const missing: NationBonusRow[] = [];
for (const mt of matches ?? []) {
  if (mt.home_score == null || mt.away_score == null) continue;
  const match: MatchResult = {
    match_id: mt.id as number,
    home_nation_id: mt.home_nation_id as number | null,
    away_nation_id: mt.away_nation_id as number | null,
    home_score: mt.home_score as number,
    away_score: mt.away_score as number,
  };
  for (const row of computeNationBonus(match, memberPicks)) {
    if (!actual.has(keyOf(row))) missing.push(row);
  }
}

console.log(`\n===== RECONCILE NATION BONUS =====`);
console.log(`missing rows to insert: ${missing.length}\n`);
const perUser = new Map<string, number>();
for (const r of missing) {
  perUser.set(r.league_member_id, (perUser.get(r.league_member_id) ?? 0) + r.points);
  console.log(
    `  ${(memberName.get(r.league_member_id) ?? "?").padEnd(16)} +${r.points}  (${r.pick_type} ${nationName.get(r.nation_id)}, match #${r.match_id})`
  );
}
if (perUser.size > 0) {
  console.log(`\n  --- totals per user ---`);
  for (const [id, t] of [...perUser.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${(memberName.get(id) ?? "?").padEnd(16)} +${t}`);
}

if (missing.length === 0) {
  console.log("\n✅ Nothing missing — already reconciled.\n");
  process.exit(0);
}
if (!WRITE) {
  console.log("\nDRY RUN — nothing written. Re-run with --write to insert.\n");
  process.exit(0);
}

console.log("\nInserting…");
const { error } = await supabase.from("nation_bonus_points").insert(missing);
if (error) {
  console.error("insert failed:", error.message);
  process.exit(1);
}
console.log(`Done — inserted ${missing.length} rows.\n`);
