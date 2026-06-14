"use client";

import { useState, useCallback } from "react";
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
}

function toIST(utcDate: string): string {
  const d = new Date(utcDate);
  // UTC+5:30
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const day = days[ist.getUTCDay()];
  const date = ist.getUTCDate();
  const month = months[ist.getUTCMonth()];
  const hh = ist.getUTCHours().toString().padStart(2, "0");
  const mm = ist.getUTCMinutes().toString().padStart(2, "0");
  return `${day} ${date} ${month} · ${hh}:${mm} IST`;
}

function formatCountdown(kickoffUtc: string): { label: string; urgent: boolean } {
  const now = Date.now();
  const kickoff = new Date(kickoffUtc).getTime();
  const diff = kickoff - now;
  const totalMin = Math.floor(diff / 1000 / 60);

  if (totalMin <= 30) {
    return { label: "Closes soon", urgent: true };
  }

  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return { label: `${days}d ${remH}h`, urgent: false };
  }

  if (hours > 0) {
    return { label: `${hours}h ${mins}m`, urgent: false };
  }

  return { label: `${mins}m`, urgent: false };
}

function ScoreStepper({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value <= 0}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          border: "1.5px solid rgba(255,255,255,0.2)",
          background: "rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.8)",
          fontSize: 18,
          fontWeight: 700,
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : 1,
        }}
        aria-label="decrease"
      >
        −
      </button>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "rgba(255,255,255,0.12)",
          border: "1.5px solid rgba(255,255,255,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-anton), sans-serif",
          fontSize: 22,
          color: "#fff",
        }}
      >
        {value}
      </div>
      <button
        onClick={() => onChange(Math.min(20, value + 1))}
        disabled={disabled}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          border: "1.5px solid rgba(255,255,255,0.2)",
          background: "rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.8)",
          fontSize: 18,
          fontWeight: 700,
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : 1,
        }}
        aria-label="increase"
      >
        +
      </button>
    </div>
  );
}

export default function PredictClient({
  matches,
  existingPredictions,
  leagueId,
  roundLabel,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [savedMatches, setSavedMatches] = useState<Set<number>>(new Set());

  // Build initial score state from existing predictions
  const initialScores = () => {
    const map: Record<number, [number, number]> = {};
    for (const m of matches) {
      const existing = existingPredictions.find((p) => p.match_id === m.id);
      map[m.id] = existing
        ? [existing.predicted_home_score, existing.predicted_away_score]
        : [0, 0];
    }
    return map;
  };

  const [scores, setScores] = useState<Record<number, [number, number]>>(initialScores);

  const currentMatch = matches[currentIndex];

  const setHomeScore = useCallback(
    (v: number) => {
      if (!currentMatch) return;
      setScores((prev) => ({ ...prev, [currentMatch.id]: [v, prev[currentMatch.id][1]] }));
    },
    [currentMatch]
  );

  const setAwayScore = useCallback(
    (v: number) => {
      if (!currentMatch) return;
      setScores((prev) => ({ ...prev, [currentMatch.id]: [prev[currentMatch.id][0], v] }));
    },
    [currentMatch]
  );

  const handleSave = async () => {
    if (!currentMatch) return;
    setSaving(true);
    const [h, a] = scores[currentMatch.id];
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league_id: leagueId,
          match_id: currentMatch.id,
          predicted_home_score: h,
          predicted_away_score: a,
        }),
      });

      if (res.ok) {
        setSavedMatches((prev) => new Set(prev).add(currentMatch.id));
        setSavedFlash(true);
        setTimeout(() => {
          setSavedFlash(false);
          if (currentIndex < matches.length - 1) setCurrentIndex((i) => i + 1);
        }, 900);
      } else {
        const data = await res.json() as { error?: string };
        alert(data.error ?? "Failed to save prediction");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    if (currentIndex < matches.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  if (matches.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 24px",
          gap: 12,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-saira), sans-serif",
            fontWeight: 700,
            fontSize: 18,
            color: "var(--n4)",
            textAlign: "center",
          }}
        >
          No open predictions right now
        </p>
        <p
          style={{
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 13,
            color: "var(--n5)",
            textAlign: "center",
          }}
        >
          Check back before the next match kicks off.
        </p>
        <Link
          href="/"
          style={{
            marginTop: 8,
            padding: "10px 24px",
            borderRadius: 10,
            background: "var(--g3)",
            color: "#fff",
            fontFamily: "var(--font-saira), sans-serif",
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Back to home
        </Link>
      </div>
    );
  }

  const match = currentMatch;
  const [homeScore, awayScore] = scores[match.id] ?? [0, 0];
  const countdown = formatCountdown(match.kickoff_time);
  const isLocked = countdown.urgent;
  const isSaved = savedMatches.has(match.id);
  const isLast = currentIndex === matches.length - 1;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "var(--surf)",
          padding: "14px 16px 12px",
          borderBottom: "1px solid rgba(14,23,38,0.07)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Link
          href="/"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--surf2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--n3)",
            flexShrink: 0,
            textDecoration: "none",
          }}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 6L8 11l6 5" />
          </svg>
        </Link>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 800,
              fontSize: 17,
              color: "var(--n0)",
              letterSpacing: 0.3,
            }}
          >
            Predict
          </span>
          <span
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 12,
              color: "var(--n5)",
            }}
          >
            {roundLabel}
          </span>
        </div>
        {/* Match counter chip */}
        <div
          style={{
            padding: "4px 10px",
            borderRadius: 20,
            background: "var(--n2)",
            color: "var(--n7)",
            fontFamily: "var(--font-saira), sans-serif",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {currentIndex + 1}/{matches.length}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            href="/rules"
            style={{ color: "var(--n5)", textDecoration: "none", fontSize: 18, lineHeight: 1, flexShrink: 0 }}
            title="How it works"
          >
            ⓘ
          </Link>
          <Link
            href="/predict/history"
            style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--g4)", textDecoration: "none", flexShrink: 0 }}
          >
            History →
          </Link>
        </div>
      </div>

      {/* Progress dots */}
      <div
        style={{
          background: "var(--surf)",
          padding: "10px 16px 12px",
          borderBottom: "1px solid rgba(14,23,38,0.07)",
          display: "flex",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {matches.map((m, i) => {
          const done = savedMatches.has(m.id);
          const cur = i === currentIndex;
          return (
            <button
              key={m.id}
              onClick={() => setCurrentIndex(i)}
              style={{
                width: cur ? 20 : 8,
                height: 8,
                borderRadius: 4,
                background: done
                  ? "var(--g3)"
                  : cur
                  ? "var(--n0)"
                  : "var(--n8)",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "width 0.2s",
              }}
              aria-label={`Match ${i + 1}`}
            />
          );
        })}
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Match card */}
        <div
          style={{
            background: "var(--n1)",
            borderRadius: 16,
            padding: "18px 16px",
            boxShadow: "var(--sh-md)",
          }}
        >
          {/* Group chip */}
          {match.group_label && (
            <div style={{ marginBottom: 12 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.08)",
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 11,
                  color: "var(--n5)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                GROUP {match.group_label}
              </span>
            </div>
          )}

          {/* Date + countdown */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 12,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              {toIST(match.kickoff_time)}
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 20,
                background: countdown.urgent
                  ? "rgba(226,59,72,0.18)"
                  : "rgba(0,184,92,0.15)",
                color: countdown.urgent ? "var(--r3)" : "var(--g4)",
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              {countdown.urgent && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--r2)",
                    display: "inline-block",
                  }}
                />
              )}
              {countdown.label}
            </div>
          </div>

          {/* Teams */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Home */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FlagChip code={match.home_nation.flag_code} />
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "#fff",
                  }}
                >
                  {match.home_nation.name}
                </span>
                {match.home_nation.fifa_ranking != null && (
                  <span
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 11,
                      color: "var(--n6)",
                    }}
                  >
                    #{match.home_nation.fifa_ranking}
                  </span>
                )}
              </div>
              {isLocked ? (
                <LockedBadge />
              ) : (
                <ScoreStepper value={homeScore} onChange={setHomeScore} disabled={saving} />
              )}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.1)" }} />

            {/* Away */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FlagChip code={match.away_nation.flag_code} />
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "#fff",
                  }}
                >
                  {match.away_nation.name}
                </span>
                {match.away_nation.fifa_ranking != null && (
                  <span
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 11,
                      color: "var(--n6)",
                    }}
                  >
                    #{match.away_nation.fifa_ranking}
                  </span>
                )}
              </div>
              {isLocked ? (
                <LockedBadge />
              ) : (
                <ScoreStepper value={awayScore} onChange={setAwayScore} disabled={saving} />
              )}
            </div>
          </div>

          {/* Venue */}
          {match.venue_city && (
            <div
              style={{
                marginTop: 12,
                textAlign: "center",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 11,
                color: "var(--n5)",
              }}
            >
              · {match.venue_city}
            </div>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "16px 0 12px" }} />

          {/* Points hint */}
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.5)",
              textAlign: "center",
              fontFamily: "var(--font-inter), sans-serif",
            }}
          >
            Correct result ={" "}
            <b style={{ color: "rgba(255,255,255,0.8)" }}>1 pt</b>
            {" · "}
            Exact score ={" "}
            <b style={{ color: "var(--g4)" }}>3 pts</b>
          </div>

          {savedFlash && (
            <div
              style={{
                marginTop: 10,
                textAlign: "center",
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 700,
                fontSize: 13,
                color: "var(--g3)",
                animation: "fadeIn 0.2s ease",
              }}
            >
              ✓ Saved!
            </div>
          )}
          {!savedFlash && isSaved && (
            <div
              style={{
                marginTop: 10,
                textAlign: "center",
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 600,
                fontSize: 12,
                color: "var(--g4)",
              }}
            >
              ✓ Prediction saved
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            gap: 10,
            paddingBottom: 16,
          }}
        >
          <button
            onClick={handleSkip}
            disabled={isLast && currentIndex === matches.length - 1}
            style={{
              flex: 1,
              padding: "13px 0",
              borderRadius: 12,
              border: "1.5px solid var(--n7)",
              background: "transparent",
              color: "var(--n4)",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Skip
          </button>
          <button
            onClick={handleSave}
            disabled={saving || isLocked}
            style={{
              flex: 1,
              padding: "13px 0",
              borderRadius: 12,
              border: "none",
              background: isLocked ? "var(--n5)" : "var(--g3)",
              color: "#fff",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 15,
              cursor: saving || isLocked ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {isLast ? "Save →" : "Save & next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FlagChip({ code }: { code: string }) {
  return (
    <div
      style={{
        padding: "5px 10px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.08)",
        borderLeft: "3px solid var(--g3)",
        fontFamily: "var(--font-saira), sans-serif",
        fontWeight: 800,
        fontSize: 13,
        color: "#fff",
        letterSpacing: 1,
        minWidth: 52,
        textAlign: "center",
      }}
    >
      {code}
    </div>
  );
}

function LockedBadge() {
  return (
    <div
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        background: "rgba(226,59,72,0.15)",
        color: "var(--r3)",
        fontFamily: "var(--font-saira), sans-serif",
        fontWeight: 700,
        fontSize: 12,
      }}
    >
      Locked
    </div>
  );
}
