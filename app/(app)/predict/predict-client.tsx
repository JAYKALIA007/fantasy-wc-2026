"use client";

import { useState } from "react";
import Link from "next/link";

interface Nation {
  id: number;
  name: string;
  flag_code: string;
  fifa_ranking?: number | null;
}

interface Match {
  id: number;
  kickoff_time: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  group_label?: string | null;
  venue_city?: string | null;
  venue_name?: string | null;
  allow_late_predictions: boolean;
  prediction_deadline: string | null;
  home_nation: Nation;
  away_nation: Nation;
  round: { id: string; name: string } | null;
}

interface ExistingPrediction {
  match_id: number;
  predicted_home_score: number;
  predicted_away_score: number;
}

interface Props {
  matches: Match[];
  existingPredictions: ExistingPrediction[];
  leagueId: string;
  roundLabel: string;
  nextUnlockLabel: string;
}

function toISTTime(utcDate: string): string {
  const ist = new Date(new Date(utcDate).getTime() + 5.5 * 60 * 60 * 1000);
  const hh = ist.getUTCHours().toString().padStart(2, "0");
  const mm = ist.getUTCMinutes().toString().padStart(2, "0");
  return `${hh}:${mm} IST`;
}

function getISTDateKey(utcDate: string): string {
  const ist = new Date(new Date(utcDate).getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth()).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

function getDayLabel(utcDate: string): string {
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const todayKey = `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth()).padStart(2, "0")}-${String(nowIST.getUTCDate()).padStart(2, "0")}`;
  const tomorrowIST = new Date(nowIST.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = `${tomorrowIST.getUTCFullYear()}-${String(tomorrowIST.getUTCMonth()).padStart(2, "0")}-${String(tomorrowIST.getUTCDate()).padStart(2, "0")}`;
  const key = getISTDateKey(utcDate);
  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  const ist = new Date(new Date(utcDate).getTime() + 5.5 * 60 * 60 * 1000);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[ist.getUTCDay()]} ${ist.getUTCDate()} ${months[ist.getUTCMonth()]}`;
}

function getCountdownChip(match: Match): { label: string; color: string; bg: string } {
  const now = Date.now();
  const minsUntilKickoff = (new Date(match.kickoff_time).getTime() - now) / 60000;
  const isLate = match.allow_late_predictions && minsUntilKickoff < 0;

  if (isLate) {
    const deadlineMs = match.prediction_deadline ? new Date(match.prediction_deadline).getTime() : null;
    const minsLeft = deadlineMs ? Math.max(0, Math.ceil((deadlineMs - now) / 60000)) : 0;
    return { label: `⚡ ${minsLeft}m left`, color: "var(--gold)", bg: "rgba(245,181,10,0.18)" };
  }
  if (minsUntilKickoff <= 30) {
    return { label: "Closes soon", color: "var(--r3)", bg: "rgba(226,59,72,0.18)" };
  }
  const hours = Math.floor(minsUntilKickoff / 60);
  const mins = Math.floor(minsUntilKickoff % 60);
  const label = hours >= 24
    ? `${Math.floor(hours / 24)}d ${hours % 24}h`
    : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return { label, color: "var(--g4)", bg: "rgba(0,184,92,0.15)" };
}

function isMatchLocked(match: Match): boolean {
  const now = Date.now();
  const minsUntilKickoff = (new Date(match.kickoff_time).getTime() - now) / 60000;
  if (minsUntilKickoff >= 0) return false;
  if (!match.allow_late_predictions) return true;
  const deadlineMs = match.prediction_deadline ? new Date(match.prediction_deadline).getTime() : null;
  return deadlineMs !== null ? now > deadlineMs : minsUntilKickoff < -45;
}

function ScoreStepper({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value <= 0}
        style={{
          width: 32, height: 32, borderRadius: 8,
          border: "1.5px solid rgba(255,255,255,0.2)",
          background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)",
          fontSize: 18, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: disabled ? 0.4 : 1,
        }}
        aria-label="decrease"
      >−</button>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-anton), sans-serif", fontSize: 22, color: "#fff",
      }}>{value}</div>
      <button
        onClick={() => onChange(Math.min(20, value + 1))}
        disabled={disabled}
        style={{
          width: 32, height: 32, borderRadius: 8,
          border: "1.5px solid rgba(255,255,255,0.2)",
          background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)",
          fontSize: 18, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: disabled ? 0.4 : 1,
        }}
        aria-label="increase"
      >+</button>
    </div>
  );
}

function FlagChip({ code }: { code: string }) {
  return (
    <div style={{
      padding: "5px 10px", borderRadius: 8,
      background: "rgba(255,255,255,0.08)", borderLeft: "3px solid var(--g3)",
      fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 13,
      color: "#fff", letterSpacing: 1, minWidth: 52, textAlign: "center",
    }}>{code}</div>
  );
}

export default function PredictClient({ matches, existingPredictions, leagueId, roundLabel, nextUnlockLabel }: Props) {
  const initialScores = () => {
    const map: Record<number, [number, number]> = {};
    for (const m of matches) {
      const existing = existingPredictions.find((p) => p.match_id === m.id);
      map[m.id] = existing ? [existing.predicted_home_score, existing.predicted_away_score] : [0, 0];
    }
    return map;
  };

  const [scores, setScores] = useState<Record<number, [number, number]>>(initialScores);
  const [savingMap, setSavingMap] = useState<Record<number, boolean>>({});
  const [savedMatches, setSavedMatches] = useState<Set<number>>(new Set(
    existingPredictions.map((p) => p.match_id)
  ));
  const [flashMap, setFlashMap] = useState<Record<number, boolean>>({});

  const handleSave = async (matchId: number) => {
    setSavingMap((prev) => ({ ...prev, [matchId]: true }));
    const [h, a] = scores[matchId] ?? [0, 0];
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league_id: leagueId, match_id: matchId, predicted_home_score: h, predicted_away_score: a }),
      });
      if (res.ok) {
        setSavedMatches((prev) => new Set(prev).add(matchId));
        setFlashMap((prev) => ({ ...prev, [matchId]: true }));
        setTimeout(() => setFlashMap((prev) => ({ ...prev, [matchId]: false })), 1500);
      } else {
        const data = await res.json() as { error?: string };
        alert(data.error ?? "Failed to save prediction");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setSavingMap((prev) => ({ ...prev, [matchId]: false }));
    }
  };

  // Group matches by IST date
  const groups = matches.reduce<Record<string, Match[]>>((acc, m) => {
    const key = getISTDateKey(m.kickoff_time);
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});
  const groupEntries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));

  if (matches.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 24px", gap: 12 }}>
        <p style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 18, color: "var(--n4)", textAlign: "center", margin: 0 }}>
          No open predictions right now
        </p>
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n5)", textAlign: "center", margin: 0 }}>
          Next window opens {nextUnlockLabel}
        </p>
        <Link href="/" style={{ marginTop: 8, padding: "10px 24px", borderRadius: 10, background: "var(--g3)", color: "#fff", fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ background: "var(--surf)", padding: "14px 16px 12px", borderBottom: "1px solid rgba(14,23,38,0.07)", display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surf2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--n3)", flexShrink: 0, textDecoration: "none" }} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 6L8 11l6 5" />
          </svg>
        </Link>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 17, color: "var(--n0)", letterSpacing: 0.3 }}>Predict</span>
          <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)" }}>{roundLabel}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/rules" style={{ color: "var(--n5)", textDecoration: "none", fontSize: 18, lineHeight: 1, flexShrink: 0 }} title="How it works">ⓘ</Link>
          <Link href="/predict/history" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--g4)", textDecoration: "none", flexShrink: 0 }}>History →</Link>
        </div>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        {groupEntries.map(([dateKey, dayMatches]) => (
          <div key={dateKey} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Day header */}
            <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 13, color: "var(--n4)", textTransform: "uppercase", letterSpacing: 1 }}>
              {getDayLabel(dayMatches[0].kickoff_time)}
            </div>

            {dayMatches.map((match) => {
              const locked = isMatchLocked(match);
              const chip = getCountdownChip(match);
              const [homeScore, awayScore] = scores[match.id] ?? [0, 0];
              const isSaved = savedMatches.has(match.id);
              const isSaving = savingMap[match.id] ?? false;
              const isFlashing = flashMap[match.id] ?? false;

              return (
                <div key={match.id} style={{ background: "var(--n1)", borderRadius: 16, padding: "16px 16px 14px", boxShadow: "var(--sh-md)", opacity: locked && !isSaved ? 0.7 : 1 }}>
                  {/* Group chip */}
                  {match.group_label && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.08)", fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, color: "var(--n5)", textTransform: "uppercase", letterSpacing: 1 }}>
                        GROUP {match.group_label}
                      </span>
                    </div>
                  )}

                  {/* Time + countdown */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                      {toISTTime(match.kickoff_time)}
                    </span>
                    <div style={{ padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.color, fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11 }}>
                      {chip.label}
                    </div>
                  </div>

                  {/* Teams */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <FlagChip code={match.home_nation.flag_code} />
                        <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 15, color: "#fff" }}>{match.home_nation.name}</span>
                        {match.home_nation.fifa_ranking != null && (
                          <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n6)" }}>#{match.home_nation.fifa_ranking}</span>
                        )}
                      </div>
                      {locked ? (
                        <div style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(226,59,72,0.15)", color: "var(--r3)", fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 12 }}>Locked</div>
                      ) : (
                        <ScoreStepper value={homeScore} onChange={(v) => setScores((prev) => ({ ...prev, [match.id]: [v, prev[match.id]?.[1] ?? 0] }))} disabled={isSaving} />
                      )}
                    </div>

                    <div style={{ height: 1, background: "rgba(255,255,255,0.1)" }} />

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <FlagChip code={match.away_nation.flag_code} />
                        <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 15, color: "#fff" }}>{match.away_nation.name}</span>
                        {match.away_nation.fifa_ranking != null && (
                          <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n6)" }}>#{match.away_nation.fifa_ranking}</span>
                        )}
                      </div>
                      {locked ? (
                        <div style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(226,59,72,0.15)", color: "var(--r3)", fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 12 }}>Locked</div>
                      ) : (
                        <ScoreStepper value={awayScore} onChange={(v) => setScores((prev) => ({ ...prev, [match.id]: [prev[match.id]?.[0] ?? 0, v] }))} disabled={isSaving} />
                      )}
                    </div>
                  </div>

                  {match.venue_city && (
                    <div style={{ marginTop: 10, textAlign: "center", fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n5)" }}>
                      · {match.venue_city}
                    </div>
                  )}

                  {!locked && (
                    <>
                      <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "12px 0 10px" }} />
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: "var(--font-inter), sans-serif" }}>
                          Result <b style={{ color: "rgba(255,255,255,0.7)" }}>+1</b> · Exact <b style={{ color: "var(--g4)" }}>+3</b>
                        </span>
                        {isFlashing ? (
                          <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13, color: "var(--g3)" }}>✓ Saved!</span>
                        ) : isSaved ? (
                          <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 600, fontSize: 12, color: "var(--g4)" }}>✓ Saved</span>
                        ) : null}
                      </div>
                      <button
                        onClick={() => handleSave(match.id)}
                        disabled={isSaving}
                        style={{
                          marginTop: 12, width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
                          background: isSaved ? "rgba(0,184,92,0.2)" : "var(--g3)",
                          color: isSaved ? "var(--g4)" : "#fff",
                          fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 15,
                          cursor: isSaving ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }}
                      >
                        {isSaving && <span className="btn-spinner" />}
                        {isSaving ? "Saving…" : isSaved ? "Update prediction" : "Save prediction"}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Next window banner */}
        <div style={{
          marginTop: 4, padding: "14px 16px", borderRadius: 14,
          background: "var(--surf2)", border: "1px dashed rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>🔒</span>
          <div>
            <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 14, color: "var(--n0)" }}>
              Next matches unlock {nextUnlockLabel}
            </div>
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", marginTop: 2 }}>
              Check back then to predict the next batch
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
