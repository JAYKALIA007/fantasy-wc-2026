import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FifaCard } from "@/components/fifa-card";
import type { CardType } from "@/components/fifa-card";
import { Countdown } from "@/components/countdown";
import { NotificationPrompt } from "@/components/notification-prompt";
import { FLAG_EMOJI } from "@/lib/utils/flags";
import { toIST, toISTWithDay } from "@/lib/utils/date";
import type { Nation } from "@/lib/types";
import { computeLeaderboard } from "@/lib/server/leaderboard";
import { BRACKET_LOCK_LEAD_MS } from "@/lib/constants";

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

type LiveMatch = {
  id: number;
  kickoff_time: string;
  group_label: string | null;
  home_score: number | null;
  away_score: number | null;
  home_nation: { name: string; flag_code: string };
  away_nation: { name: string; flag_code: string };
};

function formatCountdown(kickoffUtc: string, deadlineUtc?: string | null): string {
  const now = Date.now();
  const kickoffMs = new Date(kickoffUtc).getTime();
  if (kickoffMs <= now) {
    if (deadlineUtc) {
      return "⚡ Window open";
    }
    return "In progress";
  }
  const totalMin = Math.floor((kickoffMs - now) / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
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
    openMatchesResult,
    recentMatchesResult,
    allMembersResult,
    liveMatchesResult,
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
      .limit(10),

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
      .from("matches")
      .select(
        `id, kickoff_time, group_label, home_score, away_score,
         home_nation:home_nation_id(name, flag_code),
         away_nation:away_nation_id(name, flag_code)`
      )
      .eq("status", "scheduled")
      .lt("kickoff_time", now)
      .order("kickoff_time", { ascending: false }),
  ]);

  const leagueData = leagueDataResult.data;
  const isCreator = leagueData?.creator_id === user.id;
  const adminUserId = leagueData?.creator_id as string | null;

  // Knockout nudges: QF is the active round (QF re-draft + QF bracket). The R16
  // bracket persists as a read-only history card.
  const QF_ROUND_ID = "a0000000-0000-0000-0000-000000000004";

  const { data: redraftWin } = await supabase
    .from("redraft_windows")
    .select("status, closes_at")
    .eq("league_id", leagueId)
    .eq("round_id", QF_ROUND_ID)
    .maybeSingle();
  const redraftOpen =
    !!redraftWin &&
    redraftWin.status === "open" &&
    (!redraftWin.closes_at || new Date() < new Date(redraftWin.closes_at as string));

  // QF bracket nudge — the 4 ties; locks at first QF kickoff − lead.
  const { data: qfMatches } = await supabase
    .from("matches")
    .select("id, kickoff_time")
    .eq("round_id", QF_ROUND_ID)
    .order("kickoff_time", { ascending: true });
  const qfMatchIds = (qfMatches ?? []).map((m) => m.id as number);
  const qfTieCount = qfMatchIds.length;
  const { count: myBracketCount } = qfMatchIds.length > 0
    ? await supabase.from("ro32_bracket_picks").select("id", { count: "exact", head: true }).eq("league_id", leagueId).eq("user_id", user.id).in("match_id", qfMatchIds)
    : { count: 0 };
  const bracketLockAt = qfMatches && qfMatches[0]
    ? new Date(new Date(qfMatches[0].kickoff_time as string).getTime() - BRACKET_LOCK_LEAD_MS).toISOString()
    : null;
  const bracketLocked = bracketLockAt ? new Date() >= new Date(bracketLockAt) : true;
  const myBracketPicks = myBracketCount ?? 0;
  const bracketShow = !!bracketLockAt && (!bracketLocked || myBracketPicks > 0);
  const bracketTitle = bracketLocked ? "🏆 QF bracket results" : myBracketPicks === 0 ? "🏆 Submit your QF bracket" : myBracketPicks < qfTieCount ? "🏆 Finish your QF bracket" : "🏆 QF bracket saved";
  const bracketSub = bracketLocked
    ? "See how your QF picks are doing"
    : myBracketPicks < qfTieCount
      ? `Pick who advances in all ${qfTieCount} ties${bracketLockAt ? ` · locks ${toISTWithDay(bracketLockAt)}` : ""}`
      : `All ${qfTieCount} picked · edit anytime before lock${bracketLockAt ? ` (${toISTWithDay(bracketLockAt)})` : ""}`;

  // R16 bracket — read-only history card, shown once the QF window is live.
  const showR16History = redraftOpen || bracketShow;

  // All live matches (status=scheduled but past kickoff — scored by the edge function)
  const liveMatches: LiveMatch[] = (liveMatchesResult.data ?? []).map((raw) => ({
    id: raw.id as number,
    kickoff_time: raw.kickoff_time as string,
    group_label: raw.group_label as string | null,
    home_score: raw.home_score as number | null,
    away_score: raw.away_score as number | null,
    home_nation: Array.isArray(raw.home_nation) ? raw.home_nation[0] : (raw.home_nation as { name: string; flag_code: string }),
    away_nation: Array.isArray(raw.away_nation) ? raw.away_nation[0] : (raw.away_nation as { name: string; flag_code: string }),
  }));

  const openMatchesRaw = openMatchesResult.data;
  const openMatches: Match[] = (openMatchesRaw ?? []).map((m) => ({
    id: m.id as number,
    kickoff_time: m.kickoff_time as string,
    group_label: m.group_label as string | null,
    venue_city: m.venue_city as string | null,
    allow_late_predictions: (m.allow_late_predictions as boolean) ?? false,
    prediction_deadline: (m.prediction_deadline as string | null) ?? null,
    home_nation: Array.isArray(m.home_nation)
      ? (m.home_nation[0] as Nation)
      : (m.home_nation as Nation),
    away_nation: Array.isArray(m.away_nation)
      ? (m.away_nation[0] as Nation)
      : (m.away_nation as Nation),
  }));

  // Cap to match the predict page (which shows at most 4 matches at a time)
  const visibleOpenMatches = openMatches.slice(0, 4);

  // Next batch: all open matches sharing the earliest kickoff time
  const nextBatch: Match[] = visibleOpenMatches.length > 0
    ? visibleOpenMatches.filter((m) => m.kickoff_time === visibleOpenMatches[0].kickoff_time)
    : [];

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

  // Build leaderboard (same logic as /ranks) — canonical admin-excluded player set
  const leaderboardRows = await computeLeaderboard(supabase, leagueId, adminUserId, null);
  const competingPlayerCount = leaderboardRows.length;

  const recentMatchIds = recentMatches.map((m) => m.id);
  const nextBatchIds = nextBatch.map((m) => m.id);
  const liveMatchIds = liveMatches.map((m) => m.id);

  // Fetch sequential data in parallel
  const [predictedCountOrNull, recentPredictionsResult, nextBatchConsensusResult, livePredictionsResult] =
    await Promise.all([
      visibleOpenMatches.length > 0
        ? supabase
            .from("predictions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("league_id", leagueId)
            .in("match_id", visibleOpenMatches.map((m) => m.id))
        : Promise.resolve({ count: 0 }),

      recentMatchIds.length > 0
        ? supabase
            .from("predictions")
            .select("match_id, predicted_home_score, predicted_away_score, points")
            .eq("user_id", user.id)
            .eq("league_id", leagueId)
            .in("match_id", recentMatchIds)
        : Promise.resolve({ data: [] as Array<{ match_id: number; predicted_home_score: number; predicted_away_score: number; points: number | null }> }),

      nextBatchIds.length > 0
        ? supabase
            .from("predictions")
            .select("match_id, predicted_home_score, predicted_away_score, user_id")
            .eq("league_id", leagueId)
            .in("match_id", nextBatchIds)
        : Promise.resolve({ data: [] as Array<{ match_id: number; predicted_home_score: number; predicted_away_score: number; user_id: string }> }),

      liveMatchIds.length > 0
        ? supabase
            .from("predictions")
            .select("match_id, predicted_home_score, predicted_away_score")
            .eq("user_id", user.id)
            .eq("league_id", leagueId)
            .in("match_id", liveMatchIds)
        : Promise.resolve({ data: [] as Array<{ match_id: number; predicted_home_score: number; predicted_away_score: number }> }),
    ]);

  const predictedCount = predictedCountOrNull?.count ?? 0;
  const unpredictedCount = visibleOpenMatches.length - predictedCount;

  // Per-match consensus for the next batch, excluding admin
  type ConsensusEntry = { home: number; draw: number; away: number; total: number };
  const consensusByMatchId = new Map<number, ConsensusEntry>();
  for (const p of (nextBatchConsensusResult.data ?? []) as Array<{ match_id: number; predicted_home_score: number; predicted_away_score: number; user_id: string }>) {
    if (adminUserId && p.user_id === adminUserId) continue;
    const entry = consensusByMatchId.get(p.match_id) ?? { home: 0, draw: 0, away: 0, total: 0 };
    if (p.predicted_home_score > p.predicted_away_score) entry.home++;
    else if (p.predicted_home_score === p.predicted_away_score) entry.draw++;
    else entry.away++;
    entry.total++;
    consensusByMatchId.set(p.match_id, entry);
  }

  // Live predictions keyed by match_id
  const livePredsByMatchId = new Map(
    (livePredictionsResult.data ?? []).map((p) => [p.match_id as number, p])
  );

  type MyPrediction = { match_id: number; predicted_home_score: number; predicted_away_score: number; points: number | null };
  const myRecentPredictions: MyPrediction[] = (recentPredictionsResult.data ?? []) as MyPrediction[];

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
        {/* QF re-draft nudge */}
        {redraftOpen && (
          <Link
            href="/redraft"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              background: "var(--gbg)", border: "1.5px solid var(--g3)", borderRadius: 16,
              padding: "16px", textDecoration: "none",
            }}
          >
            <div>
              <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 15, color: "var(--g2)", letterSpacing: 0.3 }}>
                🔄 Re-draft open
              </div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--g2)", marginTop: 3, lineHeight: 1.4 }}>
                Pick your Quarter-final team{redraftWin?.closes_at ? ` · closes ${toISTWithDay(redraftWin.closes_at as string)}` : ""}
              </div>
            </div>
            <span style={{ color: "var(--g3)", fontSize: 22, flexShrink: 0 }}>›</span>
          </Link>
        )}
        {bracketShow && (
          <Link
            href="/bracket"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              background: "var(--surf)", border: "1.5px solid var(--n0)", borderRadius: 16,
              padding: "16px", textDecoration: "none",
            }}
          >
            <div>
              <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 15, color: "var(--n0)", letterSpacing: 0.3 }}>
                {bracketTitle}
              </div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n5)", marginTop: 3, lineHeight: 1.4 }}>
                {bracketSub}
              </div>
            </div>
            <span style={{ color: "var(--n0)", fontSize: 22, flexShrink: 0 }}>›</span>
          </Link>
        )}
        {/* Matchday hero card — all matches in the next batch (same kickoff) in one card */}
        {nextBatch.length > 0 && (
          <div
            style={{
              background: "var(--n1)",
              borderRadius: 16,
              padding: "18px 16px",
              boxShadow: "var(--sh-md)",
            }}
          >
            {/* Card header: shared kickoff countdown */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
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
                Next match{nextBatch.length > 1 ? "es" : ""}
              </span>
              {nextBatch[0].allow_late_predictions && new Date(nextBatch[0].kickoff_time) < new Date() ? (
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
                  <Countdown kickoffUtc={nextBatch[0].kickoff_time} />
                </div>
              )}
            </div>

            {/* One section per match, separated by a divider */}
            {nextBatch.map((match, batchIdx) => {
              const consensus = consensusByMatchId.get(match.id) ?? { home: 0, draw: 0, away: 0, total: 0 };
              return (
                <div key={match.id}>
                  {batchIdx > 0 && (
                    <div style={{ borderTop: "1px solid var(--n9)", margin: "16px 0" }} />
                  )}

                  {/* Group label for this match */}
                  {match.group_label && (
                    <div
                      style={{
                        fontFamily: "var(--font-saira), sans-serif",
                        fontWeight: 700,
                        fontSize: 11,
                        color: "rgba(255,255,255,0.35)",
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        marginBottom: 10,
                      }}
                    >
                      Group {match.group_label}
                    </div>
                  )}

                  {/* Teams */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 16,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 44, lineHeight: 1 }}>{FLAG_EMOJI[match.home_nation.name] ?? match.home_nation.flag_code}</span>
                      <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
                        {match.home_nation.name}
                      </span>
                      {match.home_nation.fifa_ranking != null && (
                        <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n6)" }}>
                          #{match.home_nation.fifa_ranking}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 28, color: "#fff" }}>VS</span>
                      <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                        {toIST(match.kickoff_time)}
                      </span>
                      {match.venue_city && (
                        <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n5)" }}>
                          · {match.venue_city}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 44, lineHeight: 1 }}>{FLAG_EMOJI[match.away_nation.name] ?? match.away_nation.flag_code}</span>
                      <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
                        {match.away_nation.name}
                      </span>
                      {match.away_nation.fifa_ranking != null && (
                        <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n6)" }}>
                          #{match.away_nation.fifa_ranking}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Consensus bar */}
                  {consensus.total > 0 && (
                    <div>
                      <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", gap: 1 }}>
                        {consensus.home > 0 && (
                          <div style={{ flex: consensus.home, background: "var(--g3)", borderRadius: "4px 0 0 4px" }} />
                        )}
                        {consensus.draw > 0 && (
                          <div style={{ flex: consensus.draw, background: "rgba(255,255,255,0.25)" }} />
                        )}
                        {consensus.away > 0 && (
                          <div style={{ flex: consensus.away, background: "#f0a030", borderRadius: "0 4px 4px 0" }} />
                        )}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                        <div style={{ display: "flex", gap: 10 }}>
                          <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 10, color: "var(--g4)" }}>● Home</span>
                          <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>● Draw</span>
                          <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 10, color: "#f0a030" }}>● Away</span>
                        </div>
                        <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                          {consensus.total} of {competingPlayerCount} predicted
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Single CTA at the bottom */}
            <Link
              href="/predict"
              style={{
                display: "block",
                marginTop: 16,
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
          </div>
        )}

        {/* Live now cards — one per live match */}
        {liveMatches.map((liveMatch) => {
          const livePred = livePredsByMatchId.get(liveMatch.id) ?? null;
          return (
            <Link
              key={liveMatch.id}
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
          );
        })}

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
              /{competingPlayerCount} players →
            </span>
          </div>
        </Link>

        {/* Notification prompt */}
        <NotificationPrompt />

        {/* Needs attention */}
        {unpredictedCount > 0 && visibleOpenMatches.length > 0 && (
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
              {visibleOpenMatches.slice(0, 3).map((m, idx) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: idx < Math.min(visibleOpenMatches.length, 3) - 1 ? "1px solid var(--n9)" : "none",
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
              {visibleOpenMatches.length > 3 && (
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
                <Link
                  key={m.id}
                  href={`/match/${m.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textDecoration: "none",
                    padding: "10px 0",
                    borderBottom: idx < recentMatches.length - 1 ? "1px solid var(--n9)" : "none",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-saira), sans-serif",
                        fontWeight: 700,
                        fontSize: 15,
                        color: "var(--n0)",
                        display: "block",
                        marginBottom: 3,
                      }}
                    >
                      {m.home_nation.flag_code} {m.home_score} – {m.away_score} {m.away_nation.flag_code}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-inter), sans-serif",
                        fontSize: 11,
                        color: "var(--n6)",
                      }}
                    >
                      {m.group_label ? `Group ${m.group_label} · ` : ""}{toIST(m.kickoff_time)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {myPred ? (
                      <>
                        <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)" }}>
                          {myPred.predicted_home_score}–{myPred.predicted_away_score}
                        </span>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 20,
                            background: pts === 3 ? "rgba(34,197,94,0.15)" : pts === 1 ? "rgba(245,181,10,0.15)" : "rgba(226,59,72,0.15)",
                            color: pts === 3 ? "var(--g3)" : pts === 1 ? "var(--gold)" : "var(--r3)",
                            fontFamily: "var(--font-saira), sans-serif",
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        >
                          {pts === 3 ? "+3 ✓" : pts === 1 ? "+1" : "0"}
                        </span>
                      </>
                    ) : (
                      <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n6)" }}>
                        No pick
                      </span>
                    )}
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--n6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {showR16History && (
          <Link
            href="/bracket?round=r16"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              background: "var(--surf)", border: "1px solid var(--n8)", borderRadius: 14,
              padding: "12px 14px", textDecoration: "none",
            }}
          >
            <div>
              <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13, color: "var(--n4)", letterSpacing: 0.3 }}>
                📜 RO16 bracket
              </div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n6)", marginTop: 2 }}>
                Your Round of 16 picks & results
              </div>
            </div>
            <span style={{ color: "var(--n6)", fontSize: 18, flexShrink: 0 }}>›</span>
          </Link>
        )}
        {showR16History && (
          <Link
            href="/bracket?round=ro32"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              background: "var(--surf)", border: "1px solid var(--n8)", borderRadius: 14,
              padding: "12px 14px", textDecoration: "none",
            }}
          >
            <div>
              <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13, color: "var(--n4)", letterSpacing: 0.3 }}>
                📜 RO32 bracket
              </div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n6)", marginTop: 2 }}>
                Your Round of 32 picks & results
              </div>
            </div>
            <span style={{ color: "var(--n6)", fontSize: 18, flexShrink: 0 }}>›</span>
          </Link>
        )}
      </div>
    </div>
  );
}
