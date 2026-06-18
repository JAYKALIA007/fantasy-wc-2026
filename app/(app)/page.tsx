import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FifaCard } from "@/components/fifa-card";
import type { CardType } from "@/components/fifa-card";
import { Countdown } from "@/components/countdown";
import { NotificationPrompt } from "@/components/notification-prompt";
import { FLAG_EMOJI } from "@/lib/utils/flags";
import { toIST } from "@/lib/utils/date";
import { ROUND_ID } from "@/lib/constants";

interface Nation {
  id: number;
  name: string;
  flag_code: string;
  fifa_ranking?: number | null;
}

interface Match {
  id: number;
  kickoff_time: string;
  group_label?: string | null;
  venue_city?: string | null;
  allow_late_predictions: boolean;
  prediction_deadline: string | null;
  home_nation: Nation;
  away_nation: Nation;
}

interface FinishedMatch {
  id: number;
  kickoff_time: string;
  group_label?: string | null;
  home_score: number;
  away_score: number;
  home_nation: { name: string; flag_code: string };
  away_nation: { name: string; flag_code: string };
}

interface LeaderboardRow {
  user_id: string;
  profile_name: string;
  total_points: number;
  joined_at: string;
}


function formatCountdown(kickoffUtc: string, deadlineUtc?: string | null): string {
  const now = Date.now();
  const kickoffMs = new Date(kickoffUtc).getTime();
  if (kickoffMs <= now) {
    if (deadlineUtc) {
      const mins = Math.max(0, Math.ceil((new Date(deadlineUtc).getTime() - now) / 60000));
      return `⚡ ${mins}m left`;
    }
    return "In progress";
  }
  const totalMin = Math.floor((kickoffMs - now) / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function FlagChip({ code }: { code: string }) {
  return (
    <div
      style={{
        padding: "5px 10px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.12)",
        borderLeft: "3px solid var(--g3)",
        fontFamily: "var(--font-saira), sans-serif",
        fontWeight: 800,
        fontSize: 14,
        color: "#fff",
        letterSpacing: 1,
      }}
    >
      {code}
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/join");
  }

  // Check if onboarded
  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id, profile_name, avatar_id, avatars(initials, position, card_type, rating, footballer_name, nation)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/onboarding");
  }

  const leagueId = membership.league_id as string;
  const now = new Date().toISOString();

  // Run all independent queries in parallel
  const [
    leagueDataResult,
    nextMatchResult,
    openMatchesResult,
    recentMatchesResult,
    allMembersResult,
    allScoresResult,
    liveMatchResult,
  ] = await Promise.all([
    supabase
      .from("leagues")
      .select("creator_id")
      .eq("id", leagueId)
      .maybeSingle(),

    supabase
      .from("matches")
      .select(
        `id, kickoff_time, group_label, venue_city, allow_late_predictions, prediction_deadline,
         home_nation:home_nation_id(id, name, flag_code, fifa_ranking),
         away_nation:away_nation_id(id, name, flag_code, fifa_ranking)`
      )
      .or(`and(status.eq.scheduled,kickoff_time.gt.${now}),and(allow_late_predictions.eq.true,prediction_deadline.gt.${now},status.neq.finished)`)
      .order("kickoff_time", { ascending: true })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("matches")
      .select(
        `id, kickoff_time, group_label, allow_late_predictions, prediction_deadline,
         home_nation:home_nation_id(id, name, flag_code, fifa_ranking),
         away_nation:away_nation_id(id, name, flag_code, fifa_ranking)`
      )
      .or(`and(status.eq.scheduled,kickoff_time.gt.${now}),and(allow_late_predictions.eq.true,prediction_deadline.gt.${now},status.neq.finished)`)
      .order("kickoff_time", { ascending: true })
      .limit(5),

    supabase
      .from("matches")
      .select(
        `id, kickoff_time, group_label, home_score, away_score,
         home_nation:home_nation_id(name, flag_code),
         away_nation:away_nation_id(name, flag_code)`
      )
      .eq("status", "finished")
      .order("kickoff_time", { ascending: false })
      .limit(3),

    supabase
      .from("league_members")
      .select("id, user_id, profile_name, joined_at")
      .eq("league_id", leagueId),

    supabase
      .from("prediction_round_scores")
      .select("user_id, total_points")
      .eq("league_id", leagueId)
      .eq("round_id", ROUND_ID),

    supabase
      .from("matches")
      .select(
        `id, kickoff_time, group_label, home_score, away_score,
         home_nation:home_nation_id(name, flag_code),
         away_nation:away_nation_id(name, flag_code)`
      )
      .eq("status", "scheduled")
      .lt("kickoff_time", now)
      .order("kickoff_time", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const leagueData = leagueDataResult.data;
  const isCreator = leagueData?.creator_id === user.id;

  // Live match + user's prediction on it
  const liveMatchRaw = liveMatchResult.data;
  type LiveMatch = { id: number; kickoff_time: string; group_label: string | null; home_score: number | null; away_score: number | null; home_nation: { name: string; flag_code: string }; away_nation: { name: string; flag_code: string } };
  const liveMatch: LiveMatch | null = liveMatchRaw
    ? {
        id: liveMatchRaw.id as number,
        kickoff_time: liveMatchRaw.kickoff_time as string,
        group_label: liveMatchRaw.group_label as string | null,
        home_score: liveMatchRaw.home_score as number | null,
        away_score: liveMatchRaw.away_score as number | null,
        home_nation: Array.isArray(liveMatchRaw.home_nation) ? liveMatchRaw.home_nation[0] : (liveMatchRaw.home_nation as { name: string; flag_code: string }),
        away_nation: Array.isArray(liveMatchRaw.away_nation) ? liveMatchRaw.away_nation[0] : (liveMatchRaw.away_nation as { name: string; flag_code: string }),
      }
    : null;

  const livePredResult = liveMatch
    ? await supabase
        .from("predictions")
        .select("predicted_home_score, predicted_away_score")
        .eq("user_id", user.id)
        .eq("league_id", leagueId)
        .eq("match_id", liveMatch.id)
        .maybeSingle()
    : null;
  const livePred = livePredResult?.data ?? null;
  const adminUserId = leagueData?.creator_id as string | null;

  const nextMatchRaw = nextMatchResult.data;
  const nextMatch: Match | null = nextMatchRaw
    ? {
        id: nextMatchRaw.id as number,
        kickoff_time: nextMatchRaw.kickoff_time as string,
        group_label: nextMatchRaw.group_label as string | null,
        venue_city: nextMatchRaw.venue_city as string | null,
        allow_late_predictions: (nextMatchRaw.allow_late_predictions as boolean) ?? false,
        prediction_deadline: (nextMatchRaw.prediction_deadline as string | null) ?? null,
        home_nation: Array.isArray(nextMatchRaw.home_nation)
          ? (nextMatchRaw.home_nation[0] as Nation)
          : (nextMatchRaw.home_nation as Nation),
        away_nation: Array.isArray(nextMatchRaw.away_nation)
          ? (nextMatchRaw.away_nation[0] as Nation)
          : (nextMatchRaw.away_nation as Nation),
      }
    : null;

  const openMatchesRaw = openMatchesResult.data;
  const openMatches: Match[] = (openMatchesRaw ?? []).map((m) => ({
    id: m.id as number,
    kickoff_time: m.kickoff_time as string,
    group_label: m.group_label as string | null,
    allow_late_predictions: (m.allow_late_predictions as boolean) ?? false,
    prediction_deadline: (m.prediction_deadline as string | null) ?? null,
    home_nation: Array.isArray(m.home_nation)
      ? (m.home_nation[0] as Nation)
      : (m.home_nation as Nation),
    away_nation: Array.isArray(m.away_nation)
      ? (m.away_nation[0] as Nation)
      : (m.away_nation as Nation),
  }));

  // Process recent matches
  const recentMatches: FinishedMatch[] = (recentMatchesResult.data ?? []).map((m) => ({
    id: m.id as number,
    kickoff_time: m.kickoff_time as string,
    group_label: m.group_label as string | null,
    home_score: m.home_score as number,
    away_score: m.away_score as number,
    home_nation: Array.isArray(m.home_nation)
      ? (m.home_nation[0] as { name: string; flag_code: string })
      : (m.home_nation as { name: string; flag_code: string }),
    away_nation: Array.isArray(m.away_nation)
      ? (m.away_nation[0] as { name: string; flag_code: string })
      : (m.away_nation as { name: string; flag_code: string }),
  }));

  // Build leaderboard member maps (excluding admin)
  const allMembersRaw = (allMembersResult.data ?? []).filter(
    (m) => m.user_id !== adminUserId
  );
  const memberIdToUserId = new Map<string, string>();
  const memberInfoMap = new Map<string, { profile_name: string; joined_at: string }>();
  for (const m of allMembersRaw) {
    memberIdToUserId.set(m.id as string, m.user_id as string);
    memberInfoMap.set(m.user_id as string, {
      profile_name: m.profile_name as string,
      joined_at: m.joined_at as string,
    });
  }

  const recentMatchIds = recentMatches.map((m) => m.id);
  const memberIds = Array.from(memberIdToUserId.keys());

  // Fetch sequential data in parallel
  const [predictedCountOrNull, recentPredictionsResult, nationBonusesResult] =
    await Promise.all([
      openMatches.length > 0
        ? supabase
            .from("predictions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("league_id", leagueId)
            .in("match_id", openMatches.map((m) => m.id))
        : Promise.resolve({ count: 0 }),

      recentMatchIds.length > 0
        ? supabase
            .from("predictions")
            .select("match_id, predicted_home_score, predicted_away_score, points")
            .eq("user_id", user.id)
            .eq("league_id", leagueId)
            .in("match_id", recentMatchIds)
        : Promise.resolve({ data: [] as Array<{ match_id: number; predicted_home_score: number; predicted_away_score: number; points: number | null }> }),

      memberIds.length > 0
        ? supabase
            .from("nation_bonus_points")
            .select("league_member_id, points")
            .in("league_member_id", memberIds)
        : Promise.resolve({ data: [] as Array<{ league_member_id: string; points: number }> }),
    ]);

  const predictedCount = predictedCountOrNull?.count ?? 0;
  const unpredictedCount = openMatches.length - predictedCount;

  type MyPrediction = { match_id: number; predicted_home_score: number; predicted_away_score: number; points: number | null };
  const myRecentPredictions: MyPrediction[] = (recentPredictionsResult.data ?? []) as MyPrediction[];

  // Build nation bonus map
  const nationBonusByUser = new Map<string, number>();
  for (const nb of (nationBonusesResult.data ?? []) as Array<{ league_member_id: string; points: number }>) {
    const uid = memberIdToUserId.get(nb.league_member_id);
    if (uid) nationBonusByUser.set(uid, (nationBonusByUser.get(uid) ?? 0) + nb.points);
  }

  // Build sorted leaderboard top 5
  const allScores = (allScoresResult.data ?? []) as Array<{ user_id: string; total_points: number }>;
  const leaderboardRows: LeaderboardRow[] = [];
  for (const s of allScores) {
    if (!memberInfoMap.has(s.user_id)) continue;
    const member = memberInfoMap.get(s.user_id)!;
    leaderboardRows.push({
      user_id: s.user_id,
      profile_name: member.profile_name,
      total_points: s.total_points + (nationBonusByUser.get(s.user_id) ?? 0),
      joined_at: member.joined_at,
    });
  }
  for (const [uid, member] of memberInfoMap.entries()) {
    if (!leaderboardRows.find((r) => r.user_id === uid)) {
      leaderboardRows.push({
        user_id: uid,
        profile_name: member.profile_name,
        total_points: nationBonusByUser.get(uid) ?? 0,
        joined_at: member.joined_at,
      });
    }
  }
  leaderboardRows.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });

  const myLeaderboardIdx = leaderboardRows.findIndex((r) => r.user_id === user.id);
  const predRank = myLeaderboardIdx !== -1 ? myLeaderboardIdx + 1 : null;

  const top5 = leaderboardRows.slice(0, 5);

  // Avatar
  type AvatarFields = { initials: string; position: string; card_type: string; rating: number; footballer_name: string; nation: string };
  const avatarRaw = membership.avatars as unknown;
  const avatar =
    avatarRaw && !Array.isArray(avatarRaw)
      ? (avatarRaw as AvatarFields)
      : Array.isArray(avatarRaw) && (avatarRaw as unknown[]).length > 0
      ? (avatarRaw as AvatarFields[])[0]
      : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
      }}
    >
      {/* App header */}
      <div
        style={{
          background: "var(--n0)",
          padding: "14px 16px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              background: "var(--g3)",
              borderRadius: 8,
              padding: "4px 8px",
              fontFamily: "var(--font-anton), sans-serif",
              fontSize: 15,
              color: "#fff",
              letterSpacing: 1,
            }}
          >
            WC
          </div>
          <span
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 800,
              fontSize: 16,
              color: "#fff",
            }}
          >
            FantasyWC
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 20,
              background: "rgba(255,255,255,0.1)",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 600,
              fontSize: 12,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--g3)",
                display: "inline-block",
              }}
            />
            Jay&apos;s League
          </div>
          <Link
            href="/help"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.7)",
              textDecoration: "none",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 15,
            }}
            aria-label="Help"
          >
            ?
          </Link>
          {isCreator && (
            <Link
              href="/admin"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.7)",
                textDecoration: "none",
                fontSize: 16,
              }}
              aria-label="Admin settings"
            >
              ⚙
            </Link>
          )}
          {avatar && (
            <FifaCard
              initials={avatar.initials}
              rating={avatar.rating}
              position={avatar.position}
              nation={avatar.nation}
              footballerName={avatar.footballer_name}
              cardType={(avatar.card_type as CardType) ?? "gold"}
              size="sm"
            />
          )}
        </div>
      </div>

      <div style={{ padding: "16px 16px 80px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Matchday hero card */}
        {nextMatch && (
          <div
            style={{
              background: "var(--n1)",
              borderRadius: 16,
              padding: "18px 16px",
              boxShadow: "var(--sh-md)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.5)",
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  {nextMatch.group_label ? `Group ${nextMatch.group_label} · ` : ""}Next match
                </span>
              </div>
              {nextMatch.allow_late_predictions && new Date(nextMatch.kickoff_time) < new Date() ? (
                <div
                  style={{
                    padding: "3px 9px",
                    borderRadius: 20,
                    background: "rgba(245,181,10,0.18)",
                    color: "var(--gold)",
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  ⚡ In progress · predict now
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 9px",
                    borderRadius: 20,
                    background: "rgba(226,59,72,0.18)",
                    color: "var(--r3)",
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--r2)", display: "inline-block" }} />
                  <Countdown kickoffUtc={nextMatch.kickoff_time} />
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 44, lineHeight: 1 }}>{FLAG_EMOJI[nextMatch.home_nation.name] ?? nextMatch.home_nation.flag_code}</span>
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "rgba(255,255,255,0.8)",
                  }}
                >
                  {nextMatch.home_nation.name}
                </span>
                {nextMatch.home_nation.fifa_ranking != null && (
                  <span
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 11,
                      color: "var(--n6)",
                    }}
                  >
                    #{nextMatch.home_nation.fifa_ranking}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    fontFamily: "var(--font-anton), sans-serif",
                    fontSize: 28,
                    color: "#fff",
                  }}
                >
                  VS
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 11,
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  {toIST(nextMatch.kickoff_time)}
                </span>
                {nextMatch.venue_city && (
                  <span
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 11,
                      color: "var(--n5)",
                    }}
                  >
                    · {nextMatch.venue_city}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 44, lineHeight: 1 }}>{FLAG_EMOJI[nextMatch.away_nation.name] ?? nextMatch.away_nation.flag_code}</span>
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "rgba(255,255,255,0.8)",
                  }}
                >
                  {nextMatch.away_nation.name}
                </span>
                {nextMatch.away_nation.fifa_ranking != null && (
                  <span
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 11,
                      color: "var(--n6)",
                    }}
                  >
                    #{nextMatch.away_nation.fifa_ranking}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <Link
                href="/predict"
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 12,
                  background: "var(--g3)",
                  color: "#fff",
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                Predict score
              </Link>
              <Link
                href="/squad"
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 12,
                  border: "1.5px solid rgba(255,255,255,0.2)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.8)",
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                My squad
              </Link>
            </div>
          </div>
        )}

        {/* Live now card */}
        {liveMatch && (
          <Link
            href={`/match/${liveMatch.id}`}
            style={{ textDecoration: "none", display: "block" }}
          >
          <div
            style={{
              background: "var(--n1)",
              borderRadius: 16,
              padding: "14px 16px",
              boxShadow: "var(--sh-md)",
              border: "1px solid rgba(226,59,72,0.3)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--r2)",
                    display: "inline-block",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 12,
                    color: "var(--r3)",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Live now
                </span>
                {liveMatch.group_label && (
                  <span
                    style={{
                      fontFamily: "var(--font-saira), sans-serif",
                      fontSize: 11,
                      color: "rgba(255,255,255,0.35)",
                    }}
                  >
                    · Group {liveMatch.group_label}
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              {/* Home */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "#fff",
                  }}
                >
                  {liveMatch.home_nation.flag_code} {liveMatch.home_nation.name}
                </span>
              </div>

              {/* Score */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                {liveMatch.home_score != null && liveMatch.away_score != null ? (
                  <span
                    style={{
                      fontFamily: "var(--font-anton), sans-serif",
                      fontSize: 24,
                      color: "#fff",
                      letterSpacing: 2,
                    }}
                  >
                    {liveMatch.home_score} – {liveMatch.away_score}
                  </span>
                ) : (
                  <span
                    style={{
                      fontFamily: "var(--font-saira), sans-serif",
                      fontWeight: 700,
                      fontSize: 16,
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    vs
                  </span>
                )}
              </div>

              {/* Away */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "#fff",
                    textAlign: "right",
                  }}
                >
                  {liveMatch.away_nation.name} {liveMatch.away_nation.flag_code}
                </span>
              </div>
            </div>

            {/* User's prediction */}
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.45)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Your pick
              </span>
              {livePred ? (
                <span
                  style={{
                    fontFamily: "var(--font-anton), sans-serif",
                    fontSize: 18,
                    color: "var(--g4)",
                    letterSpacing: 1,
                  }}
                >
                  {livePred.predicted_home_score} – {livePred.predicted_away_score}
                </span>
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 12,
                    color: "var(--n6)",
                    fontStyle: "italic",
                  }}
                >
                  No prediction made
                </span>
              )}
            </div>
          </div>
          </Link>
        )}

        {/* Rank tile */}
        <Link
          href="/ranks"
          style={{
            background: "var(--surf)",
            borderRadius: 14,
            padding: "14px 14px",
            boxShadow: "var(--sh-sm)",
            textDecoration: "none",
            display: "block",
          }}
        >
          <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", marginBottom: 6 }}>
            Your leaderboard rank
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 28, color: "var(--n0)", lineHeight: 1 }}>
              {predRank !== null ? `#${predRank}` : "--"}
            </span>
            <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)" }}>
              /{allMembersRaw.length} players →
            </span>
          </div>
        </Link>

        {/* Notification prompt */}
        <NotificationPrompt />

        {/* Needs attention */}
        {unpredictedCount > 0 && openMatches.length > 0 && (
          <div
            style={{
              background: "var(--surf)",
              borderRadius: 14,
              padding: "14px 14px",
              boxShadow: "var(--sh-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  color: "var(--n0)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Needs attention
              </span>
              <div
                style={{
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: "var(--n2)",
                  color: "var(--n7)",
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                {unpredictedCount}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {openMatches.slice(0, 3).map((m, idx) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: idx < Math.min(openMatches.length, 3) - 1 ? "1px solid var(--n9)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: idx === 0 ? "var(--r2)" : "var(--gold)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-saira), sans-serif",
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--n0)",
                      }}
                    >
                      {m.home_nation.flag_code} v {m.away_nation.flag_code} · predict
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-inter), sans-serif",
                        fontSize: 12,
                        color: "var(--n5)",
                        marginTop: 2,
                      }}
                    >
                      {new Date(m.kickoff_time).getTime() > Date.now()
                        ? `Closes in ${formatCountdown(m.kickoff_time)} · ${toIST(m.kickoff_time)}`
                        : formatCountdown(m.kickoff_time, m.prediction_deadline)}
                    </div>
                  </div>
                  <Link
                    href="/predict"
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      background: "var(--g3)",
                      color: "#fff",
                      fontFamily: "var(--font-saira), sans-serif",
                      fontWeight: 700,
                      fontSize: 12,
                      textDecoration: "none",
                      flexShrink: 0,
                    }}
                  >
                    Go
                  </Link>
                </div>
              ))}
              {openMatches.length > 3 && (
                <Link
                  href="/predict"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0 0",
                    textDecoration: "none",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--gold)",
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      fontFamily: "var(--font-saira), sans-serif",
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--n0)",
                    }}
                  >
                    For more predictions, click here
                  </div>
                  <span style={{ color: "var(--n6)", fontSize: 16 }}>›</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* League standings mini-leaderboard */}
        {top5.length > 0 && (
          <Link
            href="/ranks"
            style={{ display: "block", textDecoration: "none" }}
          >
            <div
              style={{
                background: "var(--surf)",
                borderRadius: 14,
                padding: "14px",
                boxShadow: "var(--sh-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "var(--n0)",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  League standings
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 12,
                    color: "var(--n5)",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    Full
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
                  </span>
                </span>
              </div>
              {top5.map((row, idx) => {
                const isMe = row.user_id === user.id;
                return (
                  <div
                    key={row.user_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: isMe ? "rgba(0,200,100,0.08)" : "transparent",
                      marginBottom: idx < top5.length - 1 ? 2 : 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-inter), sans-serif",
                        fontSize: 12,
                        color: idx === 0 ? "var(--gold)" : "var(--n5)",
                        width: 16,
                        textAlign: "center",
                        fontWeight: idx === 0 ? 700 : 400,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-saira), sans-serif",
                        fontWeight: isMe ? 700 : 600,
                        fontSize: 14,
                        color: "var(--n0)",
                        flex: 1,
                      }}
                    >
                      {row.profile_name}
                      {isMe && (
                        <span
                          style={{
                            fontFamily: "var(--font-inter), sans-serif",
                            fontWeight: 400,
                            fontSize: 11,
                            color: "var(--n5)",
                            marginLeft: 4,
                          }}
                        >
                          (you)
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-saira), sans-serif",
                        fontWeight: 700,
                        fontSize: 14,
                        color: isMe ? "var(--g3)" : "var(--n0)",
                      }}
                    >
                      {row.total_points}
                    </span>
                  </div>
                );
              })}
            </div>
          </Link>
        )}

        {/* Recent results */}
        {recentMatches.length > 0 && (
          <div
            style={{
              background: "var(--surf)",
              borderRadius: 14,
              padding: "14px",
              boxShadow: "var(--sh-sm)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 700,
                fontSize: 13,
                color: "var(--n0)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 10,
              }}
            >
              Recent results
            </div>
            {recentMatches.map((m, idx) => {
              const myPred = myRecentPredictions.find((p) => p.match_id === m.id);
              const pts = myPred?.points ?? null;
              return (
                <div
                  key={m.id}
                  style={{
                    padding: "10px 0",
                    borderBottom: idx < recentMatches.length - 1 ? "1px solid var(--n9)" : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-saira), sans-serif",
                        fontWeight: 700,
                        fontSize: 15,
                        color: "var(--n0)",
                      }}
                    >
                      {m.home_nation.flag_code} {m.home_score} – {m.away_score} {m.away_nation.flag_code}
                    </span>
                    {myPred ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            fontFamily: "var(--font-inter), sans-serif",
                            fontSize: 12,
                            color: "var(--n5)",
                          }}
                        >
                          {myPred.predicted_home_score}–{myPred.predicted_away_score}
                        </span>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 20,
                            background:
                              pts === 3
                                ? "rgba(34,197,94,0.15)"
                                : pts === 1
                                ? "rgba(245,181,10,0.15)"
                                : "rgba(226,59,72,0.15)",
                            color:
                              pts === 3
                                ? "var(--g3)"
                                : pts === 1
                                ? "var(--gold)"
                                : "var(--r3)",
                            fontFamily: "var(--font-saira), sans-serif",
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        >
                          {pts === 3 ? "+3 ✓" : pts === 1 ? "+1" : "0"}
                        </span>
                      </div>
                    ) : (
                      <span
                        style={{
                          fontFamily: "var(--font-inter), sans-serif",
                          fontSize: 11,
                          color: "var(--n6)",
                        }}
                      >
                        No pick
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 11,
                      color: "var(--n6)",
                    }}
                  >
                    {m.group_label ? `Group ${m.group_label} · ` : ""}{toIST(m.kickoff_time)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
