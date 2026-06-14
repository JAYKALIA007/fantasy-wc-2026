import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RanksClient from "./ranks-client";

interface RankRow {
  user_id: string;
  total_points: number;
  prediction_points: number;
  nation_bonus: number;
  profile_name: string;
  primary_nation_id: number | null;
}

export default async function RanksPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/join");
  }

  // Get league membership
  const { data: membership } = await supabase
    .from("league_members")
    .select("id, league_id, profile_name, primary_nation_id, secondary_nation_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/onboarding");
  }

  const leagueId = membership.league_id as string;

  // Get league name and player count
  const { data: league } = await supabase
    .from("leagues")
    .select("name")
    .eq("id", leagueId)
    .single();

  const { count: memberCount } = await supabase
    .from("league_members")
    .select("id", { count: "exact", head: true })
    .eq("league_id", leagueId);

  // Get all members with nation picks
  const { data: allMembers } = await supabase
    .from("league_members")
    .select("id, user_id, profile_name, primary_nation_id, secondary_nation_id")
    .eq("league_id", leagueId);

  // Build member map: league_member_id -> user_id (for nation bonus join)
  // and user_id -> member info
  const memberIdMap = new Map<string, string>(); // league_member_id -> user_id
  const memberMap = new Map<string, { profile_name: string; primary_nation_id: number | null }>();
  for (const m of allMembers ?? []) {
    memberIdMap.set(m.id as string, m.user_id as string);
    memberMap.set(m.user_id as string, {
      profile_name: m.profile_name as string,
      primary_nation_id: m.primary_nation_id as number | null,
    });
  }

  const roundId = "a0000000-0000-0000-0000-000000000001";

  // --- Nation bonus points ---
  const { data: nationBonuses } = await supabase
    .from("nation_bonus_points")
    .select("league_member_id, points")
    .in("league_member_id", Array.from(memberIdMap.keys()));

  // Sum by user_id
  const nationBonusByUser = new Map<string, number>();
  for (const nb of nationBonuses ?? []) {
    const uid = memberIdMap.get(nb.league_member_id as string);
    if (uid) {
      nationBonusByUser.set(uid, (nationBonusByUser.get(uid) ?? 0) + (nb.points as number));
    }
  }

  // --- Prediction scores ---
  const { data: scores } = await supabase
    .from("prediction_round_scores")
    .select("user_id, total_points, round_id")
    .eq("league_id", leagueId)
    .eq("round_id", roundId)
    .order("total_points", { ascending: false });

  const rankRows: RankRow[] = (scores ?? []).map((s) => {
    const userId = s.user_id as string;
    const member = memberMap.get(userId);
    const predictionPoints = s.total_points as number;
    const nationBonus = nationBonusByUser.get(userId) ?? 0;
    return {
      user_id: userId,
      total_points: predictionPoints + nationBonus,
      prediction_points: predictionPoints,
      nation_bonus: nationBonus,
      profile_name: member?.profile_name ?? "Unknown",
      primary_nation_id: member?.primary_nation_id ?? null,
    };
  });

  // Include members with 0 points who haven't scored yet
  for (const [uid, member] of memberMap.entries()) {
    if (!rankRows.find((r) => r.user_id === uid)) {
      const nationBonus = nationBonusByUser.get(uid) ?? 0;
      rankRows.push({
        user_id: uid,
        total_points: nationBonus,
        prediction_points: 0,
        nation_bonus: nationBonus,
        profile_name: member.profile_name,
        primary_nation_id: member.primary_nation_id,
      });
    }
  }
  rankRows.sort((a, b) => b.total_points - a.total_points);

  const myRankRow = rankRows.find((r) => r.user_id === user.id);
  const myRank = myRankRow ? rankRows.indexOf(myRankRow) + 1 : null;
  const leaderPoints = rankRows[0]?.total_points ?? 0;

  // --- Fantasy scores ---
  const { data: fantasyScores } = await supabase
    .from("fantasy_round_scores")
    .select("user_id, total_points")
    .eq("league_id", leagueId)
    .eq("round_id", roundId)
    .order("total_points", { ascending: false });

  const fantasyRankRows: RankRow[] = (fantasyScores ?? []).map((s) => {
    const userId = s.user_id as string;
    const member = memberMap.get(userId);
    const pts = s.total_points as number;
    return {
      user_id: userId,
      total_points: pts,
      prediction_points: pts,
      nation_bonus: 0,
      profile_name: member?.profile_name ?? "Unknown",
      primary_nation_id: member?.primary_nation_id ?? null,
    };
  });

  // Include members with 0 fantasy points
  for (const [uid, member] of memberMap.entries()) {
    if (!fantasyRankRows.find((r) => r.user_id === uid)) {
      fantasyRankRows.push({
        user_id: uid,
        total_points: 0,
        prediction_points: 0,
        nation_bonus: 0,
        profile_name: member.profile_name,
        primary_nation_id: member.primary_nation_id,
      });
    }
  }
  fantasyRankRows.sort((a, b) => b.total_points - a.total_points);

  const myFantasyRankRow = fantasyRankRows.find((r) => r.user_id === user.id);
  const myFantasyRank = myFantasyRankRow ? fantasyRankRows.indexOf(myFantasyRankRow) + 1 : null;
  const fantasyLeaderPoints = fantasyRankRows[0]?.total_points ?? 0;

  // Nation lookup for my primary pick
  const myPrimaryNationId = membership.primary_nation_id as number | null;
  let myPrimaryNationName = "";
  if (myPrimaryNationId !== null) {
    const { data: nationRow } = await supabase
      .from("nations")
      .select("name")
      .eq("id", myPrimaryNationId)
      .single();
    myPrimaryNationName = (nationRow?.name as string) ?? "";
  }

  // Build a nation name map for all members' primary nations
  const allPrimaryNationIds = Array.from(
    new Set(
      (allMembers ?? [])
        .map((m) => m.primary_nation_id as number | null)
        .filter((id): id is number => id !== null)
    )
  );
  const nationNameMap = new Map<number, string>();
  if (allPrimaryNationIds.length > 0) {
    const { data: nationsData } = await supabase
      .from("nations")
      .select("id, name")
      .in("id", allPrimaryNationIds);
    for (const n of nationsData ?? []) {
      nationNameMap.set(n.id as number, n.name as string);
    }
  }

  // Attach nation names to rank rows
  const rankRowsWithNation = rankRows.map((r) => ({
    ...r,
    primary_nation_name: r.primary_nation_id !== null ? (nationNameMap.get(r.primary_nation_id) ?? "") : "",
  }));
  const fantasyRankRowsWithNation = fantasyRankRows.map((r) => ({
    ...r,
    primary_nation_name: r.primary_nation_id !== null ? (nationNameMap.get(r.primary_nation_id) ?? "") : "",
  }));

  return (
    <RanksClient
      initialRows={rankRowsWithNation}
      initialFantasyRows={fantasyRankRowsWithNation}
      currentUserId={user.id}
      leagueName={(league?.name as string) ?? "Jay's League"}
      memberCount={memberCount ?? 0}
      leagueId={leagueId}
      roundId={roundId}
      myRank={myRank}
      myPoints={myRankRow?.total_points ?? 0}
      myFantasyRank={myFantasyRank}
      myFantasyPoints={myFantasyRankRow?.total_points ?? 0}
      myPrimaryNationName={myPrimaryNationName}
      leaderPoints={leaderPoints}
      fantasyLeaderPoints={fantasyLeaderPoints}
    />
  );
}
