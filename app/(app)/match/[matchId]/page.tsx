import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { toIST } from "@/lib/utils/date";
import { getOutcome } from "@/lib/utils/prediction";
import type { NationRef } from "@/lib/types";

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

  const [matchResult, predictionsResult, membersResult, leagueResult, cpPhasesResult, cpPicksResult] = await Promise.all([
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
    // Checkpoint phase state for this match (drives which reveals are unlocked).
    supabase
      .from("match_checkpoint_phases")
      .select("phase, status, actual_home, actual_away")
      .eq("match_id", matchIdNum),
    // Everyone's checkpoint picks. RLS returns the viewer's own picks for every
    // phase, but other players' picks only once that phase is closed/scored — so
    // the privacy gate is enforced at the DB, not just here.
    supabase
      .from("live_checkpoint_predictions")
      .select("user_id, phase, predicted_home, predicted_away, points")
      .eq("match_id", matchIdNum)
      .eq("league_id", leagueId),
  ]);

  const match = matchResult.data;
  if (!match) redirect("/");

  // Block if match hasn't kicked off yet
  const now = new Date();
  if (new Date(match.kickoff_time as string) > now) redirect("/");

  const adminUserId = leagueResult.data?.creator_id as string | null;

  const homeNation = Array.isArray(match.home_nation) ? match.home_nation[0] : match.home_nation as NationRef;
  const awayNation = Array.isArray(match.away_nation) ? match.away_nation[0] : match.away_nation as NationRef;
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

  // ── Live checkpoint reveals ────────────────────────────────────────────────
  // Each player's checkpoint picks are folded into their own card, but only for
  // phases that are LOCKED (closed/scored) — open windows stay hidden so picks
  // can't be copied live. (RLS also withholds others' picks until close.)
  const PHASE_ORDER: { phase: string; label: string }[] = [
    { phase: "h1", label: "HT" },
    { phase: "h2", label: "90'" },
    { phase: "et", label: "ET" },
    { phase: "pens", label: "PEN" },
  ];
  type CpPhase = { phase: string; status: string; actual_home: number | null; actual_away: number | null };
  type CpPick = { user_id: string; phase: string; predicted_home: number; predicted_away: number; points: number | null };
  const cpPhaseMap = new Map<string, CpPhase>();
  for (const p of (cpPhasesResult.data ?? []) as CpPhase[]) cpPhaseMap.set(p.phase, p);

  // Locked phases, in match order — these are the columns shown on every card.
  const lockedPhases = PHASE_ORDER
    .map((def) => ({ def, state: cpPhaseMap.get(def.phase) }))
    .filter((p): p is { def: { phase: string; label: string }; state: CpPhase } =>
      Boolean(p.state) && ["closed", "scored"].includes(p.state!.status))
    .map((p) => p.state.status === "scored" && p.state.actual_home != null
      ? { ...p, result: `${p.state.actual_home}–${p.state.actual_away}` }
      : { ...p, result: null as string | null });

  // userId → phase → that player's pick (locked phases only).
  const cpByUser = new Map<string, Map<string, CpPick>>();
  for (const pk of (cpPicksResult.data ?? []) as CpPick[]) {
    if (!cpPhaseMap.get(pk.phase) || !["closed", "scored"].includes(cpPhaseMap.get(pk.phase)!.status)) continue;
    if (!cpByUser.has(pk.user_id)) cpByUser.set(pk.user_id, new Map());
    cpByUser.get(pk.user_id)!.set(pk.phase, pk);
  }

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

        {/* Checkpoint results legend — actual score for each locked phase, once */}
        {lockedPhases.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            {lockedPhases.map((lp) => (
              <span key={lp.def.phase} style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n5)" }}>
                <b style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, color: "var(--n4)" }}>{lp.def.label}</b>{" "}
                {lp.result ? <span style={{ color: "var(--g2)", fontWeight: 700 }}>{lp.result}</span> : "awaiting"}
              </span>
            ))}
          </div>
        )}

        {rows.map((row) => {
          const outcome = isFinished && row.pred && match.home_score != null && match.away_score != null
            ? getOutcome(row.pred.predicted_home_score, row.pred.predicted_away_score, match.home_score as number, match.away_score as number)
            : null;
          const outcomeBg = outcome === "exact" ? "rgba(0,184,92,0.1)" : outcome === "result" ? "rgba(240,192,64,0.1)" : outcome === "miss" ? "rgba(226,59,72,0.07)" : row.isMe ? "rgba(0,184,92,0.07)" : "var(--surf)";
          const outcomeBorder = outcome === "exact" ? "1px solid rgba(0,184,92,0.25)" : outcome === "result" ? "1px solid rgba(240,192,64,0.25)" : outcome === "miss" ? "1px solid rgba(226,59,72,0.15)" : row.isMe ? "1px solid rgba(0,184,92,0.2)" : "none";
          const myCp = cpByUser.get(row.userId);
          return (
          <div
            key={row.userId}
            style={{
              background: outcomeBg,
              borderRadius: 12,
              padding: "12px 14px",
              boxShadow: "var(--sh-sm)",
              border: outcomeBorder,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 18, color: "var(--n0)", letterSpacing: 1 }}>
                    {row.pred.predicted_home_score} – {row.pred.predicted_away_score}
                  </span>
                  {isFinished && outcome && (
                    <span style={{
                      fontFamily: "var(--font-saira), sans-serif",
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      color: outcome === "exact" ? "var(--g3)" : outcome === "result" ? "#f0c040" : "var(--r3)",
                    }}>
                      {outcome === "exact" ? "⚽ Exact" : outcome === "result" ? "✓ Result" : "✗ Miss"}
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n6)", fontStyle: "italic" }}>
                  No pick
                </span>
              )}
            </div>

            {/* Checkpoint picks — only locked phases, folded into the same card */}
            {lockedPhases.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, borderTop: "1px solid rgba(14,23,38,0.06)", paddingTop: 8 }}>
                {lockedPhases.map((lp) => {
                  const pick = myCp?.get(lp.def.phase) ?? null;
                  const scored = lp.state.status === "scored";
                  const correct = scored && (pick?.points ?? 0) > 0;
                  return (
                    <span key={lp.def.phase} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "3px 8px", borderRadius: 7,
                      background: correct ? "rgba(0,184,92,0.15)" : "rgba(14,23,38,0.05)",
                      fontFamily: "var(--font-inter), sans-serif", fontSize: 11,
                    }}>
                      <b style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, color: correct ? "var(--g2)" : "var(--n5)", letterSpacing: 0.3 }}>{lp.def.label}</b>
                      <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, color: pick ? "var(--n0)" : "var(--n6)" }}>
                        {pick ? `${pick.predicted_home}–${pick.predicted_away}` : "—"}
                      </span>
                      {correct && <span style={{ color: "var(--g3)", fontWeight: 800 }}>+{pick!.points}</span>}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
