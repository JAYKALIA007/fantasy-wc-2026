"use client";

import { useState } from "react";
import Link from "next/link";
import { toISTTime, getISTDateKey, getDayLabel } from "@/lib/utils/date";
import type { Nation } from "@/lib/types";
import type { CheckpointPhase, CheckpointPick } from "./page";

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
  checkpointPhasesByMatch: Record<number, CheckpointPhase[]>;
  checkpointPicksByMatch: Record<number, CheckpointPick[]>;
}


function getCountdownChip(match: Match): { label: string; color: string; bg: string } {
  const now = Date.now();
  const minsUntilKickoff = (new Date(match.kickoff_time).getTime() - now) / 60000;
  const isLate = match.allow_late_predictions && minsUntilKickoff < 0;

  if (isLate) {
    return { label: "⚡ Window open", color: "var(--gold)", bg: "rgba(245,181,10,0.18)" };
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

const PHASE_LABELS: Record<string, string> = {
  h1: "Half-time",
  h2: "90' score",
  et: "Extra time",
  pens: "Penalties",
};

function CheckpointSection({
  matchId,
  leagueId,
  phases,
  myPicks,
}: {
  matchId: number;
  leagueId: string;
  phases: CheckpointPhase[];
  myPicks: CheckpointPick[];
}) {
  if (phases.length === 0) return null;

  // h1 + h2 can be open at once (both shown upfront); render an input per open phase.
  const openPhases = phases.filter((p) => p.status === "open").sort((a, b) => a.phase.localeCompare(b.phase));
  const closedPhases = phases.filter((p) => ["closed", "scored"].includes(p.status));

  return (
    <div style={{ marginTop: 12, borderTop: "1px dashed rgba(255,255,255,0.12)", paddingTop: 12 }}>
      <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, color: "var(--n5)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
        Live checkpoints
      </div>

      {/* Recap of closed phases */}
      {closedPhases.map((p) => {
        const myPick = myPicks.find((pk) => pk.phase === p.phase);
        const isScored = p.status === "scored";
        return (
          <div key={p.phase} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)" }}>
              {PHASE_LABELS[p.phase] ?? p.phase}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {myPick ? (
                <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n4)" }}>
                  {myPick.predicted_home}–{myPick.predicted_away}
                </span>
              ) : (
                <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n6)" }}>—</span>
              )}
              {isScored && p.actual_home != null && (
                <>
                  <span style={{ color: "var(--n7)", fontSize: 11 }}>vs</span>
                  <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 12, color: "var(--n3)" }}>
                    {p.actual_home}–{p.actual_away}
                  </span>
                  {myPick && (
                    <span style={{
                      fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 12,
                      color: (myPick.points ?? 0) > 0 ? "var(--g3)" : "var(--n6)",
                    }}>
                      {(myPick.points ?? 0) > 0 ? `+${myPick.points}` : "0"}
                    </span>
                  )}
                </>
              )}
              {!isScored && (
                <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n6)" }}>awaiting result</span>
              )}
            </div>
          </div>
        );
      })}

      {/* One input per open phase (h1 locks at kickoff, h2 at half-time) */}
      {openPhases.map((p) => (
        <OpenPhaseInput
          key={p.phase}
          matchId={matchId}
          leagueId={leagueId}
          phase={p.phase}
          existingPick={myPicks.find((pk) => pk.phase === p.phase) ?? null}
        />
      ))}
    </div>
  );
}

function OpenPhaseInput({
  matchId,
  leagueId,
  phase,
  existingPick,
}: {
  matchId: number;
  leagueId: string;
  phase: string;
  existingPick: CheckpointPick | null;
}) {
  const [home, setHome] = useState(existingPick?.predicted_home ?? 0);
  const [away, setAway] = useState(existingPick?.predicted_away ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(existingPick != null);
  const [committedHome, setCommittedHome] = useState(existingPick?.predicted_home ?? 0);
  const [committedAway, setCommittedAway] = useState(existingPick?.predicted_away ?? 0);
  const [flash, setFlash] = useState(false);

  const isDirty = home !== committedHome || away !== committedAway;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/checkpoint-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, phase, predicted_home: home, predicted_away: away, league_id: leagueId }),
      });
      if (res.ok) {
        setSaved(true);
        setCommittedHome(home);
        setCommittedAway(away);
        setFlash(true);
        setTimeout(() => setFlash(false), 1500);
      } else {
        const data = await res.json() as { error?: string };
        alert(data.error ?? "Failed to save");
      }
    } catch {
      alert("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 12, color: "var(--gold)", marginBottom: 8 }}>
        ⚡ {PHASE_LABELS[phase] ?? phase} — predict now
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
        <ScoreStepper value={home} onChange={setHome} disabled={saving} />
        <span style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 18, color: "var(--n5)" }}>–</span>
        <ScoreStepper value={away} onChange={setAway} disabled={saving} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-inter), sans-serif" }}>
          Exact <b style={{ color: "var(--g4)" }}>+2</b>
        </span>
        {flash ? (
          <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 12, color: "var(--g3)" }}>✓ Saved!</span>
        ) : saved && !isDirty ? (
          <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 600, fontSize: 11, color: "var(--g4)" }}>✓ Saved</span>
        ) : null}
      </div>
      <button
        onClick={handleSubmit}
        disabled={saving}
        style={{
          marginTop: 8, width: "100%", padding: "10px 0", borderRadius: 10, border: "none",
          background: saved && !isDirty ? "rgba(0,184,92,0.2)" : "rgba(0,184,92,0.35)",
          color: saved && !isDirty ? "var(--g4)" : "#fff",
          fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13,
          cursor: saving ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "Saving…" : saved && !isDirty ? "Update pick" : "Save pick"}
      </button>
    </div>
  );
}

export default function PredictClient({ matches, existingPredictions, leagueId, roundLabel, nextUnlockLabel, checkpointPhasesByMatch, checkpointPicksByMatch }: Props) {
  const initialScores = () => {
    const map: Record<number, [number, number]> = {};
    for (const m of matches) {
      const existing = existingPredictions.find((p) => p.match_id === m.id);
      map[m.id] = existing ? [existing.predicted_home_score, existing.predicted_away_score] : [0, 0];
    }
    return map;
  };

  const [scores, setScores] = useState<Record<number, [number, number]>>(initialScores);
  const [committedScores, setCommittedScores] = useState<Record<number, [number, number]>>(initialScores);
  const [savingMap, setSavingMap] = useState<Record<number, boolean>>({});
  const [savedMatches, setSavedMatches] = useState<Set<number>>(new Set(
    existingPredictions.map((p) => p.match_id)
  ));
  const [flashMap, setFlashMap] = useState<Record<number, boolean>>({});

  const isDirty = (matchId: number) => {
    const [h, a] = scores[matchId] ?? [0, 0];
    const [ch, ca] = committedScores[matchId] ?? [0, 0];
    return h !== ch || a !== ca;
  };

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
        setCommittedScores((prev) => ({ ...prev, [matchId]: scores[matchId] ?? [0, 0] }));
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
          <Link href="/predict/history" style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--g4)", textDecoration: "none", flexShrink: 0 }}>
            History
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
          </Link>
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
              const isKnockout = match.round && match.round.id !== "a0000000-0000-0000-0000-000000000001";
              const matchPhases = checkpointPhasesByMatch[match.id] ?? [];
              const matchPicks = checkpointPicksByMatch[match.id] ?? [];

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
                    {locked ? (
                      <div style={{ padding: "3px 9px", borderRadius: 20, background: "rgba(226,59,72,0.15)", color: "var(--r3)", fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11 }}>
                        🔒 Locked
                      </div>
                    ) : (
                      <div style={{ padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.color, fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11 }}>
                        {chip.label}
                      </div>
                    )}
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
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-anton), sans-serif", fontSize: 22, color: isSaved ? "#fff" : "var(--n5)" }}>
                          {isSaved ? (committedScores[match.id]?.[0] ?? "—") : "—"}
                        </div>
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
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-anton), sans-serif", fontSize: 22, color: isSaved ? "#fff" : "var(--n5)" }}>
                          {isSaved ? (committedScores[match.id]?.[1] ?? "—") : "—"}
                        </div>
                      ) : (
                        <ScoreStepper value={awayScore} onChange={(v) => setScores((prev) => ({ ...prev, [match.id]: [prev[match.id]?.[0] ?? 0, v] }))} disabled={isSaving} />
                      )}
                    </div>
                  </div>

                  {isKnockout && matchPhases.length > 0 && (
                    <CheckpointSection
                      matchId={match.id}
                      leagueId={leagueId}
                      phases={matchPhases}
                      myPicks={matchPicks}
                    />
                  )}

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
                        ) : isSaved && !isDirty(match.id) ? (
                          <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 600, fontSize: 12, color: "var(--g4)" }}>✓ Saved</span>
                        ) : null}
                      </div>
                      <button
                        onClick={() => handleSave(match.id)}
                        disabled={isSaving}
                        style={{
                          marginTop: 12, width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
                          background: isSaved && !isDirty(match.id) ? "rgba(0,184,92,0.2)" : "var(--g3)",
                          color: isSaved && !isDirty(match.id) ? "var(--g4)" : "#fff",
                          fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 15,
                          cursor: isSaving ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }}
                      >
                        {isSaving && <span className="btn-spinner" />}
                        {isSaving ? "Saving…" : isSaved && !isDirty(match.id) ? "Update prediction" : "Save prediction"}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      </div>
    </div>
  );
}
