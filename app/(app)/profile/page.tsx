import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { FLAG_EMOJI } from "@/lib/utils/flags";
import { ROUND_ID } from "@/lib/constants";
import { computeLeaderboard } from "@/lib/server/leaderboard";

export default async function ProfilePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/join");

  const { data: membership } = await supabase
    .from("league_members")
    .select(`league_id, profile_name,
      primary_nation:primary_nation_id(name, flag_code),
      secondary_nation:secondary_nation_id(name, flag_code)`)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const leagueId = membership.league_id as string;
  const profileName = membership.profile_name as string;

  type NationBasic = { name: string; flag_code: string };
  const primaryNation = (Array.isArray(membership.primary_nation) ? membership.primary_nation[0] : membership.primary_nation) as NationBasic | null;
  const secondaryNation = (Array.isArray(membership.secondary_nation) ? membership.secondary_nation[0] : membership.secondary_nation) as NationBasic | null;

  const [leagueResult, predsResult] = await Promise.all([
    supabase.from("leagues").select("creator_id").eq("id", leagueId).maybeSingle(),
    supabase.from("predictions").select(`match_id, predicted_home_score, predicted_away_score, points,
      match:match_id(kickoff_time, home_score, away_score, status)`).eq("user_id", user.id).eq("league_id", leagueId),
  ]);

  const adminUserId = leagueResult.data?.creator_id as string | null;

  const leaderboardRows = await computeLeaderboard(supabase, leagueId, adminUserId, ROUND_ID);

  const myRow = leaderboardRows.find(r => r.user_id === user.id);
  const myRank = myRow ? leaderboardRows.indexOf(myRow) + 1 : leaderboardRows.length + 1;
  const totalPlayers = leaderboardRows.length || 1;
  const nationBonus = myRow?.nation_bonus ?? 0;
  const totalPoints = myRow?.total_points ?? 0;

  // Prediction stats — only kicked-off matches
  const now = new Date();
  type PredRaw = { match_id: number; predicted_home_score: number; predicted_away_score: number; points: number | null; match: { kickoff_time: string; home_score: number | null; away_score: number | null; status: string } | { kickoff_time: string; home_score: number | null; away_score: number | null; status: string }[] | null };
  const preds = ((predsResult.data ?? []) as PredRaw[]).filter(p => {
    const m = Array.isArray(p.match) ? p.match[0] : p.match;
    return m && new Date(m.kickoff_time) < now;
  });

  const total = preds.length;
  const finished = preds.filter(p => { const m = Array.isArray(p.match) ? p.match[0] : p.match; return m?.status === "finished"; });
  const correct = finished.filter(p => (p.points ?? 0) >= 1).length;
  const exact = finished.filter(p => (p.points ?? 0) >= 3).length;

  const primaryFlag = primaryNation ? (FLAG_EMOJI[primaryNation.name] ?? "🌐") : null;
  const secondaryFlag = secondaryNation ? (FLAG_EMOJI[secondaryNation.name] ?? "🌐") : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", backgroundColor: "var(--bg)" }}>
      {/* Header */}
      <div style={{ background: "var(--n0)", padding: "28px 20px 24px", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontFamily: "var(--font-anton), sans-serif", fontSize: 26, color: "#fff", letterSpacing: 1 }}>
          {profileName.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 24, color: "#fff", letterSpacing: 0.5, marginBottom: 4 }}>
          {profileName}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 10 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 28, color: "#fff", lineHeight: 1 }}>{totalPoints}</div>
            <div style={{ fontFamily: "var(--font-saira), sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 3 }}>pts</div>
          </div>
          <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.15)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 28, color: "#fff", lineHeight: 1 }}>#{myRank}</div>
            <div style={{ fontFamily: "var(--font-saira), sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 3 }}>of {totalPlayers}</div>
          </div>
          {nationBonus > 0 && (
            <>
              <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.15)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 28, color: "var(--g4)", lineHeight: 1 }}>+{nationBonus}</div>
                <div style={{ fontFamily: "var(--font-saira), sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 3 }}>nation</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ padding: "16px 16px 80px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Prediction stats */}
        <div style={{ background: "var(--surf)", borderRadius: 14, padding: "16px", boxShadow: "var(--sh-sm)" }}>
          <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 12, color: "var(--n4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>
            Prediction stats
          </div>
          <div style={{ display: "flex", gap: 0 }}>
            {[
              { label: "Made", value: total },
              { label: "Correct", value: correct },
              { label: "Exact", value: exact },
            ].map((s, i) => (
              <div key={s.label} style={{ flex: 1, textAlign: "center", borderRight: i < 2 ? "1px solid var(--n9)" : "none" }}>
                <div style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 26, color: "var(--n0)", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n5)", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {total > 0 && (
            <div style={{ marginTop: 14, height: 6, borderRadius: 3, background: "var(--n9)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: "var(--g3)", width: `${Math.round((correct / total) * 100)}%` }} />
            </div>
          )}
          {total > 0 && (
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n5)", marginTop: 6 }}>
              {Math.round((correct / total) * 100)}% correct result rate
            </div>
          )}
        </div>

        {/* Nations */}
        {(primaryNation || secondaryNation) && (
          <div style={{ background: "var(--surf)", borderRadius: 14, padding: "16px", boxShadow: "var(--sh-sm)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 12, color: "var(--n4)", textTransform: "uppercase", letterSpacing: 0.8 }}>
                Your nations
              </div>
              <Link href="/nation" style={{ fontFamily: "var(--font-saira), sans-serif", fontSize: 12, fontWeight: 600, color: "var(--g3)", textDecoration: "none" }}>
                Manage →
              </Link>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {primaryNation && (
                <div style={{ flex: 1, background: "var(--surf2)", border: "2px solid var(--g3)", borderRadius: 12, padding: "14px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, boxShadow: "0 0 0 3px rgba(0,184,92,0.1)" }}>
                  <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--g2)" }}>#1 Pick</span>
                  <span style={{ fontSize: 36, lineHeight: 1 }}>{primaryFlag}</span>
                  <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13, color: "var(--n0)", textAlign: "center" }}>{primaryNation.name}</span>
                </div>
              )}
              {secondaryNation && (
                <div style={{ flex: 1, background: "var(--surf2)", border: "2px solid var(--g3)", borderRadius: 12, padding: "14px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, boxShadow: "0 0 0 3px rgba(0,184,92,0.1)" }}>
                  <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--g2)" }}>Wildcard</span>
                  <span style={{ fontSize: 36, lineHeight: 1 }}>{secondaryFlag}</span>
                  <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13, color: "var(--n0)", textAlign: "center" }}>{secondaryNation.name}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Prediction history link */}
        <Link href="/predict/history" style={{ textDecoration: "none", display: "block" }}>
          <div style={{ background: "var(--surf)", borderRadius: 14, padding: "14px 16px", boxShadow: "var(--sh-sm)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 14, color: "var(--n0)" }}>Prediction history</div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", marginTop: 2 }}>All your picks and results</div>
            </div>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--n6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </div>
        </Link>

        {/* Rules link */}
        <Link href="/rules" style={{ textDecoration: "none", display: "block" }}>
          <div style={{ background: "var(--surf)", borderRadius: 14, padding: "14px 16px", boxShadow: "var(--sh-sm)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 14, color: "var(--n0)" }}>Scoring rules</div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", marginTop: 2 }}>How points and nation bonus work</div>
            </div>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--n6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </div>
        </Link>

      </div>
    </div>
  );
}
