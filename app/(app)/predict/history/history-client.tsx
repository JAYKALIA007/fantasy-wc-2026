"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface NationInfo {
  name: string;
  flag_code: string;
}

interface MatchInfo {
  kickoff_time: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  group_label: string | null;
  home_nation: NationInfo;
  away_nation: NationInfo;
}

export interface PredictionRecord {
  id: string;
  match_id: number;
  predicted_home_score: number;
  predicted_away_score: number;
  points: number | null;
  nation_bonus: number | null;
  match: MatchInfo;
}

interface MatchSummary {
  total: number;
  correct: number;
  exact: number;
}

interface NationBasic {
  name: string;
  flag_code: string;
}

interface Props {
  predictions: PredictionRecord[];
  profileName?: string;
  backHref?: string;
  nationBonus?: number;
  primaryNation?: NationBasic;
  secondaryNation?: NationBasic;
}

function toIST(utcDate: string): string {
  const d = new Date(utcDate);
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

function PointsBadge({ points }: { points: number | null }) {
  if (points === null) {
    return (
      <span
        style={{
          fontFamily: "var(--font-inter), sans-serif",
          fontSize: 12,
          color: "var(--n6)",
          fontStyle: "italic",
        }}
      >
        Pending
      </span>
    );
  }

  const color = points >= 3 ? "var(--g4)" : points >= 1 ? "#f0c040" : "var(--r3)";
  const bg = points >= 3 ? "rgba(0,184,92,0.15)" : points >= 1 ? "rgba(240,192,64,0.15)" : "rgba(226,59,72,0.15)";

  return (
    <div
      style={{
        padding: "4px 10px",
        borderRadius: 20,
        background: bg,
        color,
        fontFamily: "var(--font-saira), sans-serif",
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      {points > 0 ? `+${points}` : "0"}
    </div>
  );
}

const PAGE_SIZE = 5;

export default function HistoryClient({ predictions, profileName, backHref, nationBonus, primaryNation, secondaryNation }: Props) {
  const [summaries, setSummaries] = useState<Record<number, MatchSummary>>({});
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const finishedIds = predictions
      .filter((p) => p.match.status === "finished")
      .map((p) => p.match_id);

    if (finishedIds.length === 0) return;

    void Promise.all(
      finishedIds.map((id) =>
        fetch(`/api/match-predictions-summary?match_id=${id}`)
          .then((r) => r.json() as Promise<MatchSummary>)
          .then((data) => ({ id, data }))
          .catch(() => null)
      )
    ).then((results) => {
      const map: Record<number, MatchSummary> = {};
      for (const res of results) {
        if (res) map[res.id] = res.data;
      }
      setSummaries(map);
    });
  }, [predictions]);

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
          href={backHref ?? "/predict"}
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
        <div style={{ flex: 1 }}>
          <span
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 800,
              fontSize: 17,
              color: "var(--n0)",
              letterSpacing: 0.3,
            }}
          >
            {profileName ?? "My Predictions"}
          </span>
          {profileName && (primaryNation || secondaryNation) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              {primaryNation && (
                <span
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 11,
                    color: "var(--n4)",
                  }}
                >
                  {primaryNation.flag_code} {primaryNation.name}
                </span>
              )}
              {secondaryNation && (
                <>
                  <span style={{ fontSize: 10, color: "var(--n7)" }}>·</span>
                  <span
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 11,
                      color: "var(--n5)",
                    }}
                  >
                    {secondaryNation.flag_code} {secondaryNation.name}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {nationBonus !== undefined && nationBonus > 0 && (
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 20,
                background: "rgba(0,184,92,0.12)",
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 700,
                fontSize: 12,
                color: "var(--g2)",
              }}
            >
              +{nationBonus}n
            </span>
          )}
          {predictions.length > 0 && (
            <span
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 12,
                color: "var(--n5)",
              }}
            >
              {predictions.length} predictions
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {predictions.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: 80,
              gap: 10,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 700,
                fontSize: 16,
                color: "var(--n4)",
                textAlign: "center",
              }}
            >
              No predictions yet
            </p>
            <p
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 13,
                color: "var(--n5)",
                textAlign: "center",
              }}
            >
              {profileName
                ? `${profileName} hasn't made any predictions for kicked-off matches.`
                : "Head to Predict to make your first prediction."}
            </p>
            {!profileName && (
              <Link
                href="/predict"
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
                Predict now
              </Link>
            )}
          </div>
        )}

        {predictions.slice(0, visibleCount).map((p) => {
          const isFinished = p.match.status === "finished";
          return (
            <Link
              key={p.id}
              href={`/match/${p.match_id}`}
              style={{ textDecoration: "none", display: "block" }}
            >
            <div
              style={{
                background: "var(--surf)",
                borderRadius: 14,
                padding: "14px",
                boxShadow: "var(--sh-sm)",
              }}
            >
              {/* Top row: group chip + time */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {p.match.group_label && (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 7px",
                        borderRadius: 5,
                        background: "var(--n9)",
                        fontFamily: "var(--font-saira), sans-serif",
                        fontWeight: 700,
                        fontSize: 10,
                        color: "var(--n5)",
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}
                    >
                      GROUP {p.match.group_label}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 11,
                      color: "var(--n6)",
                    }}
                  >
                    {toIST(p.match.kickoff_time)}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <PointsBadge points={isFinished ? (p.points ?? 0) : null} />
                    {isFinished && p.nation_bonus != null && p.nation_bonus > 0 && (
                      <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, color: "var(--g3)" }}>
                        +{p.nation_bonus}n
                      </span>
                    )}
                  </div>
                  {isFinished && summaries[p.match_id] && summaries[p.match_id].total > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-inter), sans-serif",
                        fontSize: 11,
                        color: "var(--n5)",
                      }}
                    >
                      {summaries[p.match_id].correct}/{summaries[p.match_id].total} correct
                    </span>
                  )}
                </div>
              </div>

              {/* Teams row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--n0)",
                  }}
                >
                  {p.match.home_nation.flag_code} {p.match.home_nation.name}
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 12,
                    color: "var(--n6)",
                  }}
                >
                  vs
                </span>
                <div
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--n0)",
                    textAlign: "right",
                  }}
                >
                  {p.match.away_nation.name} {p.match.away_nation.flag_code}
                </div>
              </div>

              {/* Scores row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  paddingTop: 10,
                  borderTop: "1px solid var(--n9)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 10,
                      color: "var(--n6)",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 3,
                    }}
                  >
                    {profileName ? `${profileName}'s pick` : "Your prediction"}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-anton), sans-serif",
                      fontSize: 20,
                      color: "var(--n0)",
                    }}
                  >
                    {p.predicted_home_score} – {p.predicted_away_score}
                  </div>
                </div>

                {isFinished && p.match.home_score != null && p.match.away_score != null && (
                  <div style={{ flex: 1, textAlign: "right" }}>
                    <div
                      style={{
                        fontFamily: "var(--font-inter), sans-serif",
                        fontSize: 10,
                        color: "var(--n6)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 3,
                      }}
                    >
                      Actual result
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-anton), sans-serif",
                        fontSize: 20,
                        color: "var(--n0)",
                      }}
                    >
                      {p.match.home_score} – {p.match.away_score}
                    </div>
                  </div>
                )}

                {!isFinished && (
                  <div
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 12,
                      color: "var(--n6)",
                      fontStyle: "italic",
                    }}
                  >
                    Match pending
                  </div>
                )}
              </div>
            </div>
            </Link>
          );
        })}

        {visibleCount < predictions.length && (
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 10,
              border: "1px solid var(--n8)",
              background: "var(--surf)",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 13,
              color: "var(--n3)",
              cursor: "pointer",
            }}
          >
            Show {Math.min(PAGE_SIZE, predictions.length - visibleCount)} more
          </button>
        )}
      </div>
    </div>
  );
}
