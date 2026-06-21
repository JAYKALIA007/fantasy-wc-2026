// READ-ONLY audit: for every finished match, compare the nation bonuses that
// SHOULD exist (computeNationBonus over current picks) against what's actually
// in nation_bonus_points. Prints every discrepancy. Writes nothing.
//
//   node --env-file=.env.local --experimental-strip-types scripts/audit-nation-bonus.ts
//
// Note: valid because picks are locked during the group stage, so current picks
// == picks at scoring time. (Revisit once knockout reassignment goes live.)

import { createClient } from "@supabase/supabase-js";
import { computeNationBonus, type MemberPicks, type MatchResult } from "../lib/server/nationBonus.ts";

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
  .eq("status", "finished")
  .order("id", { ascending: true });

const { data: actualRows } = await supabase
  .from("nation_bonus_points")
  .select("league_member_id, match_id, nation_id, pick_type, points");

const key = (r: { league_member_id: string; match_id: number; nation_id: number; pick_type: string }) =>
  `${r.league_member_id}|${r.match_id}|${r.nation_id}|${r.pick_type}`;

const actualMap = new Map<string, number>();
for (const r of actualRows ?? []) actualMap.set(key(r as never), r.points as number);

// Build expected
const expectedMap = new Map<string, { points: number; match_id: number; nation_id: number; pick_type: string; league_member_id: string }>();
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
    expectedMap.set(key(row), { ...row });
  }
}

const fmt = (r: { league_member_id: string; match_id: number; nation_id: number; pick_type: string }, pts: number) =>
  `${(memberName.get(r.league_member_id) ?? "?").padEnd(16)} ${r.pick_type.padEnd(9)} ${(nationName.get(r.nation_id) ?? `#${r.nation_id}`).padEnd(14)} match #${r.match_id}  ${pts >= 0 ? "+" : ""}${pts}`;

const missing: string[] = [];
const mismatch: string[] = [];
const extra: string[] = [];
const netByUser = new Map<string, number>();
const bump = (id: string, d: number) => netByUser.set(id, (netByUser.get(id) ?? 0) + d);

for (const [k, exp] of expectedMap) {
  if (!actualMap.has(k)) {
    missing.push(fmt(exp, exp.points));
    bump(exp.league_member_id, exp.points);
  } else if (actualMap.get(k) !== exp.points) {
    mismatch.push(`${fmt(exp, exp.points)}  (actual ${actualMap.get(k)})`);
    bump(exp.league_member_id, exp.points - (actualMap.get(k) as number));
  }
}
for (const [k, pts] of actualMap) {
  if (!expectedMap.has(k)) {
    const [lm, mid, nid, pt] = k.split("|");
    extra.push(fmt({ league_member_id: lm, match_id: Number(mid), nation_id: Number(nid), pick_type: pt }, pts));
    bump(lm, -pts);
  }
}

console.log(`\n===== NATION BONUS AUDIT =====`);
console.log(`finished matches: ${matches?.length ?? 0}  |  expected rows: ${expectedMap.size}  |  actual rows: ${actualMap.size}\n`);

console.log(`--- MISSING (should exist, not awarded) : ${missing.length} ---`);
missing.forEach((l) => console.log("  " + l));
console.log(`\n--- POINTS MISMATCH : ${mismatch.length} ---`);
mismatch.forEach((l) => console.log("  " + l));
console.log(`\n--- EXTRA (awarded but should not exist) : ${extra.length} ---`);
extra.forEach((l) => console.log("  " + l));

if (netByUser.size > 0) {
  console.log(`\n--- NET CORRECTION PER USER (if fixed) ---`);
  for (const [id, d] of [...netByUser.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(memberName.get(id) ?? "?").padEnd(16)} ${d >= 0 ? "+" : ""}${d}`);
  }
}

const clean = missing.length === 0 && mismatch.length === 0 && extra.length === 0;
console.log(`\n${clean ? "✅ CLEAN — every finished match's bonuses match." : "⚠ discrepancies found (read-only; nothing changed)."}\n`);
