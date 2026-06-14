import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RanksClient from "./ranks-client";

interface RankRow {
  user_id: string;
  total_points: number;
  profile_name: string;
  initials: string;
  position: string;
}

export default async function RanksPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/join");
  }

  // Get league membership with avatar
  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id, profile_name, avatar_id, avatars(initials, position)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/onboarding");
  }

  // Get league name and player count
  const { data: league } = await supabase
    .from("leagues")
    .select("name")
    .eq("id", membership.league_id)
    .single();

  const { count: memberCount } = await supabase
    .from("league_members")
    .select("id", { count: "exact", head: true })
    .eq("league_id", membership.league_id);

  // Get all members with their avatars
  const { data: allMembers } = await supabase
    .from("league_members")
    .select("user_id, profile_name, avatars(initials, position)")
    .eq("league_id", membership.league_id);

  // Build member map
  const memberMap = new Map<string, { profile_name: string; initials: string; position: string }>();
  for (const m of allMembers ?? []) {
    const av = Array.isArray(m.avatars)
      ? (m.avatars[0] as { initials: string; position: string } | undefined)
      : (m.avatars as { initials: string; position: string } | null | undefined);
    memberMap.set(m.user_id as string, {
      profile_name: m.profile_name as string,
      initials: av?.initials ?? "??",
      position: av?.position ?? "mid",
    });
  }

  const roundId = "a0000000-0000-0000-0000-000000000001";

  // --- Prediction scores ---
  const { data: scores } = await supabase
    .from("prediction_round_scores")
    .select("user_id, total_points, round_id")
    .eq("league_id", membership.league_id)
    .eq("round_id", roundId)
    .order("total_points", { ascending: false });

  const rankRows: RankRow[] = (scores ?? []).map((s) => {
    const member = memberMap.get(s.user_id as string);
    return {
      user_id: s.user_id as string,
      total_points: s.total_points as number,
      profile_name: member?.profile_name ?? "Unknown",
      initials: member?.initials ?? "??",
      position: member?.position ?? "mid",
    };
  });

  // Include members with 0 points who haven't scored yet
  for (const [uid, member] of memberMap.entries()) {
    if (!rankRows.find((r) => r.user_id === uid)) {
      rankRows.push({
        user_id: uid,
        total_points: 0,
        profile_name: member.profile_name,
        initials: member.initials,
        position: member.position,
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
    .eq("league_id", membership.league_id)
    .eq("round_id", roundId)
    .order("total_points", { ascending: false });

  const fantasyRankRows: RankRow[] = (fantasyScores ?? []).map((s) => {
    const member = memberMap.get(s.user_id as string);
    return {
      user_id: s.user_id as string,
      total_points: s.total_points as number,
      profile_name: member?.profile_name ?? "Unknown",
      initials: member?.initials ?? "??",
      position: member?.position ?? "mid",
    };
  });

  // Include members with 0 fantasy points
  for (const [uid, member] of memberMap.entries()) {
    if (!fantasyRankRows.find((r) => r.user_id === uid)) {
      fantasyRankRows.push({
        user_id: uid,
        total_points: 0,
        profile_name: member.profile_name,
        initials: member.initials,
        position: member.position,
      });
    }
  }
  fantasyRankRows.sort((a, b) => b.total_points - a.total_points);

  const myFantasyRankRow = fantasyRankRows.find((r) => r.user_id === user.id);
  const myFantasyRank = myFantasyRankRow ? fantasyRankRows.indexOf(myFantasyRankRow) + 1 : null;
  const fantasyLeaderPoints = fantasyRankRows[0]?.total_points ?? 0;

  // Avatar
  const avatarRaw = membership.avatars as unknown;
  const myAvatar =
    avatarRaw && !Array.isArray(avatarRaw)
      ? (avatarRaw as { initials: string; position: string })
      : Array.isArray(avatarRaw) && (avatarRaw as unknown[]).length > 0
      ? (avatarRaw as { initials: string; position: string }[])[0]
      : null;

  return (
    <RanksClient
      initialRows={rankRows}
      initialFantasyRows={fantasyRankRows}
      currentUserId={user.id}
      leagueName={(league?.name as string) ?? "Jay's League"}
      memberCount={memberCount ?? 0}
      leagueId={membership.league_id as string}
      roundId={roundId}
      myRank={myRank}
      myPoints={myRankRow?.total_points ?? 0}
      myFantasyRank={myFantasyRank}
      myFantasyPoints={myFantasyRankRow?.total_points ?? 0}
      myInitials={myAvatar?.initials ?? "??"}
      myPosition={myAvatar?.position ?? "mid"}
      leaderPoints={leaderPoints}
      fantasyLeaderPoints={fantasyLeaderPoints}
    />
  );
}
