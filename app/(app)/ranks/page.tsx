import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RanksClient from "./ranks-client";
import { computeLeaderboard, type LeaderboardRow } from "@/lib/server/leaderboard";
import { ROUND_ID } from "@/lib/constants";

interface RankRow extends LeaderboardRow {
  primary_nation_name: string;
}

export default async function RanksPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/join");
  }

  const { data: membership } = await supabase
    .from("league_members")
    .select("id, league_id, profile_name, primary_nation_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/onboarding");
  }

  const leagueId = membership.league_id as string;

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

  const rankRows = await computeLeaderboard(supabase, leagueId, adminUserId, null);

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
    new Set(rankRows.map((r) => r.primary_nation_id).filter((id): id is number => id !== null))
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

  const rankRowsWithNation: RankRow[] = rankRows.map((r) => ({
    ...r,
    primary_nation_name: r.primary_nation_id !== null ? (nationNameMap.get(r.primary_nation_id) ?? "") : "",
  }));

  // Non-admin member count
  const nonAdminMemberCount = (memberCount ?? 0) - (adminUserId ? 1 : 0);

  return (
    <RanksClient
      initialRows={rankRowsWithNation}
      currentUserId={user.id}
      leagueName={(league?.name as string) ?? "Jay's League"}
      memberCount={nonAdminMemberCount}
      leagueId={leagueId}
      roundId={ROUND_ID}
      myRank={myRank}
      myPoints={myRankRow?.total_points ?? 0}
      myPrimaryNationName={myPrimaryNationName}
      leaderPoints={leaderPoints}
    />
  );
}
