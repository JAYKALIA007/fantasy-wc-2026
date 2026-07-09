import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BracketClient from "./bracket-client";
import { ROUND_IDS, BRACKET_LOCK_LEAD_MS } from "@/lib/constants";
import { resolveAdvancers, scoreBracket, type BracketTie } from "@/lib/server/bracket";

type NationRef = { id: number; name: string };

export default async function BracketPage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/join");

  const sp = await searchParams;
  const round: "ro32" | "r16" | "qf" = sp.round === "ro32" ? "ro32" : sp.round === "r16" ? "r16" : "qf";
  const roundId = ROUND_IDS[round];
  const roundLabel = round === "ro32" ? "RO32" : round === "r16" ? "RO16" : "QF";

  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect("/onboarding");
  const leagueId = membership.league_id as string;

  const { data: league } = await supabase.from("leagues").select("creator_id").eq("id", leagueId).single();
  const adminUserId = (league?.creator_id as string | null) ?? null;

  // The 16 ties with team names.
  const { data: matchesRaw } = await supabase
    .from("matches")
    .select("id, kickoff_time, home_nation:home_nation_id(id, name), away_nation:away_nation_id(id, name)")
    .eq("round_id", roundId)
    .order("kickoff_time", { ascending: true });
  const matches = (matchesRaw ?? []).map((m) => {
    const home = (Array.isArray(m.home_nation) ? m.home_nation[0] : m.home_nation) as NationRef;
    const away = (Array.isArray(m.away_nation) ? m.away_nation[0] : m.away_nation) as NationRef;
    return { id: m.id as number, kickoff_time: m.kickoff_time as string, home, away };
  });

  // Bracket locks BRACKET_LOCK_LEAD_MS before the first match (midnight IST).
  const lockAt = matches.length > 0 ? new Date(new Date(matches[0].kickoff_time).getTime() - BRACKET_LOCK_LEAD_MS).toISOString() : null;
  const locked = lockAt ? new Date() >= new Date(lockAt) : false;

  // Scope picks to THIS round's ties — the table is shared across rounds (keyed by
  // match_id), so filter by the round's match ids or RO32 picks would leak in.
  const matchIds = matches.map((m) => m.id);

  // This user's existing picks.
  const { data: myPicksRaw } = await supabase
    .from("ro32_bracket_picks")
    .select("match_id, advancer_nation_id")
    .eq("league_id", leagueId)
    .eq("user_id", user.id)
    .in("match_id", matchIds);
  const myPicks: Record<number, number> = {};
  for (const p of myPicksRaw ?? []) myPicks[p.match_id as number] = p.advancer_nation_id as number;

  // Standings (admin-excluded). Resolve advancers from RO32 eliminations.
  const { data: membersRaw } = await supabase
    .from("league_members")
    .select("user_id, profile_name")
    .eq("league_id", leagueId);
  const members = (membersRaw ?? []).filter((m) => m.user_id !== adminUserId);
  const nameByUser = new Map(members.map((m) => [m.user_id as string, m.profile_name as string]));
  const userIds = members.map((m) => m.user_id as string);

  const { data: allPicks } = await supabase
    .from("ro32_bracket_picks")
    .select("user_id, match_id, advancer_nation_id")
    .eq("league_id", leagueId)
    .in("match_id", matchIds);

  const { data: eliminated } = await supabase
    .from("nations")
    .select("id")
    .eq("eliminated_in_round", round);
  const eliminatedIds = new Set((eliminated ?? []).map((n) => n.id as number));

  const ties: BracketTie[] = matches.map((m) => ({ match_id: m.id, home_nation_id: m.home.id, away_nation_id: m.away.id }));
  const advancers = resolveAdvancers(ties, eliminatedIds);
  const standings = scoreBracket(
    userIds,
    (allPicks ?? []).map((p) => ({ user_id: p.user_id as string, match_id: p.match_id as number, advancer_nation_id: p.advancer_nation_id as number })),
    advancers
  )
    .filter((s) => s.picked > 0)
    .map((s) => ({ ...s, name: nameByUser.get(s.user_id) ?? "—", isMe: s.user_id === user.id }));

  const resolvedCount = advancers.size;

  // Reveal everyone's picks per tie once the bracket locks — mirrors the live-
  // checkpoint rule (picks hidden from others until the window closes). Before
  // lock, tiePicks stays empty so only the user's own selections are visible.
  const tiePicks: Record<number, { name: string; isMe: boolean; advancer_nation_id: number }[]> = {};
  if (locked) {
    const memberIdSet = new Set(userIds);
    for (const p of allPicks ?? []) {
      const uid = p.user_id as string;
      if (!memberIdSet.has(uid)) continue; // drops admin
      const mid = p.match_id as number;
      (tiePicks[mid] ??= []).push({
        name: nameByUser.get(uid) ?? "—",
        isMe: uid === user.id,
        advancer_nation_id: p.advancer_nation_id as number,
      });
    }
    for (const arr of Object.values(tiePicks)) {
      arr.sort((a, b) => (a.isMe === b.isMe ? a.name.localeCompare(b.name) : a.isMe ? -1 : 1));
    }
  }

  return (
    <BracketClient
      leagueId={leagueId}
      roundLabel={roundLabel}
      matches={matches}
      myPicks={myPicks}
      locked={locked}
      lockAt={lockAt}
      standings={standings}
      resolvedCount={resolvedCount}
      advancers={Object.fromEntries(advancers)}
      tiePicks={tiePicks}
    />
  );
}
