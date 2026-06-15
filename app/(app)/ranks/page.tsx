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
  primary_nation_name: string;
  joined_at: string;
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
    .select("id, league_id, profile_name, primary_nation_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/onboarding");
  }

  const leagueId = membership.league_id as string;

  // Get league name and creator (to filter admin from leaderboard)
  const { data: league } = await supabase
    .from("leagues")
    .select("name, creator_id")
    .eq("id", leagueId)
    .single();

  const adminUserId = league?.creator_id as string | null;

  const { count: memberCount } = await supabase
    .from("league_members")
    .select("id", { count: "exact", head: true })
    .eq("league_id", leagueId);

  // Get all members with nation picks, excluding admin
  const { data: allMembersRaw } = await supabase
    .from("league_members")
    .select("id, user_id, profile_name, primary_nation_id, joined_at")
    .eq("league_id", leagueId);

  const allMembers = (allMembersRaw ?? []).filter(
    (m) => m.user_id !== adminUserId
  );

  const memberIdMap = new Map<string, string>(); // league_member_id -> user_id
  const memberMap = new Map<string, { profile_name: string; primary_nation_id: number | null; joined_at: string }>();
  for (const m of allMembers) {
    memberIdMap.set(m.id as string, m.user_id as string);
    memberMap.set(m.user_id as string, {
      profile_name: m.profile_name as string,
      primary_nation_id: m.primary_nation_id as number | null,
      joined_at: m.joined_at as string,
    });
  }

  const roundId = "a0000000-0000-0000-0000-000000000001";

  // Nation bonus points
  const { data: nationBonuses } = await supabase
    .from("nation_bonus_points")
    .select("league_member_id, points")
    .in("league_member_id", Array.from(memberIdMap.keys()));

  const nationBonusByUser = new Map<string, number>();
  for (const nb of nationBonuses ?? []) {
    const uid = memberIdMap.get(nb.league_member_id as string);
    if (uid) {
      nationBonusByUser.set(uid, (nationBonusByUser.get(uid) ?? 0) + (nb.points as number));
    }
  }

  // Prediction scores
  const { data: scores } = await supabase
    .from("prediction_round_scores")
    .select("user_id, total_points")
    .eq("league_id", leagueId)
    .eq("round_id", roundId)
    .order("total_points", { ascending: false });

  const rankRows: RankRow[] = (scores ?? [])
    .filter((s) => memberMap.has(s.user_id as string))
    .map((s) => {
      const userId = s.user_id as string;
      const member = memberMap.get(userId)!;
      const predictionPoints = s.total_points as number;
      const nationBonus = nationBonusByUser.get(userId) ?? 0;
      return {
        user_id: userId,
        total_points: predictionPoints + nationBonus,
        prediction_points: predictionPoints,
        nation_bonus: nationBonus,
        profile_name: member.profile_name,
        primary_nation_id: member.primary_nation_id,
        primary_nation_name: "",
        joined_at: member.joined_at,
      };
    });

  // Include members with 0 points
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
        primary_nation_name: "",
        joined_at: member.joined_at,
      });
    }
  }
  rankRows.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });

  const myRankRow = rankRows.find((r) => r.user_id === user.id);
  const myRank = myRankRow ? rankRows.indexOf(myRankRow) + 1 : null;
  const leaderPoints = rankRows[0]?.total_points ?? 0;

  // Nation name lookup
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

  const allPrimaryNationIds = Array.from(
    new Set(
      allMembers
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

  const rankRowsWithNation = rankRows.map((r) => ({
    ...r,
    primary_nation_name: r.primary_nation_id !== null ? (nationNameMap.get(r.primary_nation_id) ?? "") : "",
  }));

  return (
    <RanksClient
      initialRows={rankRowsWithNation}
      currentUserId={user.id}
      leagueName={(league?.name as string) ?? "Jay's League"}
      memberCount={allMembers.length}
      leagueId={leagueId}
      roundId={roundId}
      myRank={myRank}
      myPoints={myRankRow?.total_points ?? 0}
      myPrimaryNationName={myPrimaryNationName}
      leaderPoints={leaderPoints}
    />
  );
}
