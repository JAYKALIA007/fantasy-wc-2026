// Backfill nation bonuses for the pre-launch matches (#1-#8, played 11-14 Jun
// before the app existed). Scores are already in the DB; only nation_bonus_points
// rows are missing. Reuses the SAME tested logic as the match-score handler.
//
// Dry run (default — prints lists, writes nothing):
//   node --env-file=.env.local --experimental-strip-types scripts/backfill-nation-bonus.ts
// Commit:
//   node --env-file=.env.local --experimental-strip-types scripts/backfill-nation-bonus.ts --write
//
// Idempotent: deletes existing nation_bonus_points for these matches before
// inserting, so re-running is safe. Does NOT call the API / fire notifications.

import { createClient } from "@supabase/supabase-js";
import { computeNationBonus, type MemberPicks, type MatchResult } from "../lib/server/nationBonus.ts";

const MATCH_IDS = [1, 2, 3, 4, 5, 6, 7, 8];
const WRITE = process.argv.includes("--write");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const { data: members } = await supabase
  .from("league_members")
  .select("id, profile_name, primary_nation_id, secondary_nation_id");

const { data: nations } = await supabase.from("nations").select("id, name");
const nationName = new Map<number, string>();
for (const n of nations ?? []) nationName.set(n.id as number, n.name as string);

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

// ---- TEAMS PICKED -------------------------------------------------------
console.log("\n===== TEAMS PICKED =====");
const fmtNation = (id: number | null) => (id == null ? "—" : nationName.get(id) ?? `#${id}`);
const sorted = [...(members ?? [])].sort((a, b) =>
  (a.profile_name as string).localeCompare(b.profile_name as string)
);
for (const m of sorted) {
  console.log(
    `  ${(m.profile_name as string).padEnd(16)} primary: ${fmtNation(m.primary_nation_id as number | null).padEnd(16)} secondary: ${fmtNation(m.secondary_nation_id as number | null)}`
  );
}

// ---- MATCHES + BONUS COMPUTATION ---------------------------------------
const { data: matches } = await supabase
  .from("matches")
  .select("id, home_nation_id, away_nation_id, home_score, away_score, status")
  .in("id", MATCH_IDS)
  .order("id", { ascending: true });

const allRows = [];
for (const mt of matches ?? []) {
  if (mt.status !== "finished" || mt.home_score == null || mt.away_score == null) {
    console.log(`\n  ⚠ match #${mt.id} not finished/scored — skipping`);
    continue;
  }
  const match: MatchResult = {
    match_id: mt.id as number,
    home_nation_id: mt.home_nation_id as number | null,
    away_nation_id: mt.away_nation_id as number | null,
    home_score: mt.home_score as number,
    away_score: mt.away_score as number,
  };
  allRows.push(...computeNationBonus(match, memberPicks));
}

// ---- USERS WHO BENEFIT --------------------------------------------------
console.log("\n===== USERS WHO BENEFIT FROM BACKFILL =====");
const perUser = new Map<string, number>();
for (const r of allRows) {
  perUser.set(r.league_member_id, (perUser.get(r.league_member_id) ?? 0) + r.points);
  console.log(
    `  ${(memberName.get(r.league_member_id) ?? "?").padEnd(16)} +${r.points}  (${r.pick_type} ${nationName.get(r.nation_id)}, match #${r.match_id})`
  );
}
console.log("\n  --- totals per user ---");
for (const [id, total] of [...perUser.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${(memberName.get(id) ?? "?").padEnd(16)} +${total}`);
}
console.log(`\n  ${allRows.length} bonus rows, ${perUser.size} users affected.`);

// ---- WRITE --------------------------------------------------------------
if (!WRITE) {
  console.log("\nDRY RUN — nothing written. Re-run with --write to commit.\n");
  process.exit(0);
}

console.log("\nWriting…");
const { error: delErr } = await supabase
  .from("nation_bonus_points")
  .delete()
  .in("match_id", MATCH_IDS);
if (delErr) {
  console.error("delete failed:", delErr.message);
  process.exit(1);
}
if (allRows.length > 0) {
  const { error: insErr } = await supabase.from("nation_bonus_points").insert(allRows);
  if (insErr) {
    console.error("insert failed:", insErr.message);
    process.exit(1);
  }
}
console.log(`Done — inserted ${allRows.length} rows.\n`);
