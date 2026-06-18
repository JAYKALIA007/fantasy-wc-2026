import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

function toIST(utcDate: string): string {
  const d = new Date(utcDate);
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const hh = ist.getUTCHours().toString().padStart(2, "0");
  const mm = ist.getUTCMinutes().toString().padStart(2, "0");
  return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} · ${hh}:${mm} IST`;
}

export default async function MatchPredictionsPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/join");

  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const leagueId = membership.league_id as string;
  const matchIdNum = parseInt(matchId, 10);

  const [matchResult, predictionsResult, membersResult, leagueResult] = await Promise.all([
    supabase
      .from("matches")
      .select("id, kickoff_time, status, home_score, away_score, group_label, home_nation:home_nation_id(name, flag_code), away_nation:away_nation_id(name, flag_code)")
      .eq("id", matchIdNum)
      .single(),
    supabase
      .from("predictions")
      .select("user_id, predicted_home_score, predicted_away_score, points")
      .eq("match_id", matchIdNum)
      .eq("league_id", leagueId),
    supabase
      .from("league_members")
      .select("user_id, profile_name")
      .eq("league_id", leagueId),
    supabase
      .from("leagues")
      .select("creator_id")
      .eq("id", leagueId)
      .maybeSingle(),
  ]);

  const match = matchResult.data;
  if (!match) redirect("/");

  // Block if match hasn't kicked off yet
  const now = new Date();
  if (new Date(match.kickoff_time as string) > now) redirect("/");

  const adminUserId = leagueResult.data?.creator_id as string | null;

  type NationInfo = { name: string; flag_code: string };
  const homeNation = Array.isArray(match.home_nation) ? match.home_nation[0] : match.home_nation as NationInfo;
  const awayNation = Array.isArray(match.away_nation) ? match.away_nation[0] : match.away_nation as NationInfo;
  const isFinished = match.status === "finished";

  const memberMap = new Map<string, string>();
  for (const m of (membersResult.data ?? [])) {
    if (m.user_id !== adminUserId) memberMap.set(m.user_id as string, m.profile_name as string);
  }

  type PredRow = { user_id: string; predicted_home_score: number; predicted_away_score: number; points: number | null };
  const predMap = new Map<string, PredRow>();
  for (const p of (predictionsResult.data ?? [])) {
    predMap.set(p.user_id as string, {
      user_id: p.user_id as string,
      predicted_home_score: p.predicted_home_score as number,
      predicted_away_score: p.predicted_away_score as number,
      points: p.points as number | null,
    });
  }

  const rows = Array.from(memberMap.entries()).map(([userId, name]) => ({
    userId,
    name,
    pred: predMap.get(userId) ?? null,
    isMe: userId === user.id,
  })).sort((a, b) => {
    // Me first, then by points desc, then alpha
    if (a.isMe) return -1;
    if (b.isMe) return 1;
    const ap = a.pred?.points ?? -1;
    const bp = b.pred?.points ?? -1;
    return bp - ap;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", backgroundColor: "var(--bg)" }}>
      {/* Header */}
      <div style={{ background: "var(--n0)", padding: "14px 16px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Link
            href="/"
            style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.7)", flexShrink: 0, textDecoration: "none" }}
          >
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 6L8 11l6 5" />
            </svg>
          </Link>
          <div>
            <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 13, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8 }}>
              {match.group_label ? `Group ${match.group_label as string} · ` : ""}All predictions
            </div>
          </div>
        </div>

        {/* Match scoreline */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 16, color: "#fff" }}>
              {homeNation.flag_code} {homeNation.name}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            {isFinished ? (
              <div style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 26, color: "#fff", letterSpacing: 2 }}>
                {match.home_score as number} – {match.away_score as number}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--r2)", display: "inline-block", animation: "pulse 1.5s ease-in-out infinite" }} />
                <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 12, color: "var(--r3)", textTransform: "uppercase", letterSpacing: 1 }}>Live</span>
              </div>
            )}
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
              {toIST(match.kickoff_time as string)}
            </div>
          </div>
          <div style={{ flex: 1, textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 16, color: "#fff" }}>
              {awayNation.name} {awayNation.flag_code}
            </div>
          </div>
        </div>
      </div>

      {/* Predictions list */}
      <div style={{ padding: "16px 16px 80px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n5)", marginBottom: 4 }}>
          {rows.filter(r => r.pred).length} of {rows.length} members predicted
        </div>

        {rows.map((row) => (
          <div
            key={row.userId}
            style={{
              background: row.isMe ? "rgba(0,184,92,0.07)" : "var(--surf)",
              borderRadius: 12,
              padding: "12px 14px",
              boxShadow: "var(--sh-sm)",
              border: row.isMe ? "1px solid rgba(0,184,92,0.2)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: row.isMe ? 700 : 600, fontSize: 14, color: "var(--n0)" }}>
                  {row.name}
                </span>
                {row.isMe && (
                  <span style={{ fontFamily: "var(--font-saira), sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--g2)" }}>
                    you
                  </span>
                )}
              </div>
            </div>

            {row.pred ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 18, color: "var(--n0)", letterSpacing: 1 }}>
                  {row.pred.predicted_home_score} – {row.pred.predicted_away_score}
                </span>
                {isFinished && (
                  <div style={{
                    padding: "3px 9px",
                    borderRadius: 20,
                    background: (row.pred.points ?? 0) >= 3 ? "rgba(0,184,92,0.15)" : (row.pred.points ?? 0) >= 1 ? "rgba(240,192,64,0.15)" : "rgba(226,59,72,0.15)",
                    color: (row.pred.points ?? 0) >= 3 ? "var(--g3)" : (row.pred.points ?? 0) >= 1 ? "#f0c040" : "var(--r3)",
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 12,
                  }}>
                    {(row.pred.points ?? 0) > 0 ? `+${row.pred.points}` : "0"}
                  </div>
                )}
              </div>
            ) : (
              <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n6)", fontStyle: "italic" }}>
                No pick
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
