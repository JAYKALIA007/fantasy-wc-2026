"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { FLAG_EMOJI } from "@/lib/utils/flags";
import type { LeaderboardApiRow } from "@/app/api/leaderboard/route";

type RankRow = LeaderboardApiRow;

interface Props {
  initialRows: RankRow[];
  currentUserId: string;
  leagueName: string;
  memberCount: number;
  leagueId: string;
  roundId: string;
  ro32RoundId: string;
  myRank: number | null;
  myPoints: number;
  myPrimaryNationName: string;
  leaderPoints: number;
}

type LeaderboardView = "overall" | "ro32";

const roundLabels: Record<string, string> = {
  "a0000000-0000-0000-0000-000000000001": "Group Stage",
  "a0000000-0000-0000-0000-000000000002": "R16",
};

function RankList({
  rows,
  currentUserId,
}: {
  rows: RankRow[];
  currentUserId: string;
}) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          background: "var(--surf)",
          borderRadius: 14,
          padding: "32px 16px",
          textAlign: "center",
          boxShadow: "var(--sh-sm)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 13,
            color: "var(--n5)",
            margin: 0,
          }}
        >
          No scores yet — matches are still in progress!
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surf)",
        borderRadius: 14,
        boxShadow: "var(--sh-sm)",
        overflow: "hidden",
      }}
    >
      {rows.map((row, idx) => {
        const rank = idx + 1;
        const isMe = row.user_id === currentUserId;
        const flag = FLAG_EMOJI[row.primary_nation_name] ?? "🌐";

        return (
          <Link
            key={row.user_id}
            href={isMe ? "/profile" : `/player/${row.user_id}`}
            className="active:opacity-70 transition-opacity"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderBottom: idx < rows.length - 1 ? "1px solid var(--n9)" : "none",
              background: isMe ? "rgba(0,184,92,0.07)" : "transparent",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            {/* Rank */}
            <span
              style={{
                fontFamily: "var(--font-anton), sans-serif",
                fontSize: 22,
                width: 30,
                flexShrink: 0,
                textAlign: "center",
                color: rank <= 3 ? "var(--gold)" : "var(--n4)",
              }}
            >
              {rank}
            </span>

            {/* Name */}
            <div
              style={{
                flex: 1,
                fontFamily: "var(--font-saira), sans-serif",
                fontSize: 14,
                fontWeight: isMe ? 700 : 500,
              }}
            >
              {row.profile_name}
              {isMe && (
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    color: "var(--g2)",
                    marginLeft: 6,
                  }}
                >
                  you
                </span>
              )}
            </div>

            {/* Nation flag */}
            <span style={{ fontSize: 22, flexShrink: 0 }}>{flag}</span>

            {/* Points */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span
                  style={{
                    fontFamily: "var(--font-anton), sans-serif",
                    fontSize: 17,
                    minWidth: 36,
                    textAlign: "right",
                    color: "var(--n0)",
                  }}
                >
                  {row.total_points}
                </span>
                {row.nation_bonus > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-saira), sans-serif",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--g2)",
                      textAlign: "right",
                    }}
                  >
                    +{row.nation_bonus}n
                  </span>
                )}
              </div>
            </div>

            {/* Tap affordance */}
            <span style={{ color: "var(--n7)", fontSize: 18, flexShrink: 0, marginLeft: 2 }}>›</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function RanksClient({
  initialRows,
  currentUserId,
  leagueName,
  memberCount,
  roundId,
  ro32RoundId,
  myRank,
  myPoints,
  myPrimaryNationName,
  leaderPoints,
}: Props) {
  const [rows, setRows] = useState<RankRow[]>(initialRows);
  const [view, setView] = useState<LeaderboardView>("overall");

  const fetchLeaderboard = useCallback(async (v: LeaderboardView) => {
    try {
      // overall → cumulative; ro32 → all components scoped to the RO32 round.
      const url = v === "ro32" ? `/api/leaderboard?round_id=${ro32RoundId}` : `/api/leaderboard`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as { rows: RankRow[] };
      if (data.rows) setRows(data.rows);
    } catch {
      // Keep showing last known rows on transient failures.
    }
  }, [ro32RoundId]);

  const switchView = useCallback((v: LeaderboardView) => {
    setView(v);
    void fetchLeaderboard(v);
  }, [fetchLeaderboard]);

  const myCurrentRow = rows.find((r) => r.user_id === currentUserId);
  const myCurrentRank = myCurrentRow ? rows.indexOf(myCurrentRow) + 1 : myRank;
  const myCurrentPoints = myCurrentRow?.total_points ?? myPoints;
  const currentLeaderPoints = rows[0]?.total_points ?? leaderPoints;
  const gapToLeader = currentLeaderPoints - myCurrentPoints;
  const myFlag = FLAG_EMOJI[myPrimaryNationName] ?? "🌐";

  return (
    <div>
      {/* App header */}
      <div
        style={{
          background: "var(--n0)",
          padding: "14px 16px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span
              style={{
                fontFamily: "var(--font-anton), sans-serif",
                fontSize: 22,
                color: "#fff",
                letterSpacing: 0.5,
              }}
            >
              Leaderboard
            </span>
            <span
              style={{
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 600,
                fontSize: 12,
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              {leagueName} · {memberCount} players
            </span>
          </div>
          <div
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              background: "var(--n2)",
              color: "var(--n7)",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            {roundLabels[roundId] ?? "R16"}
          </div>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          padding: "16px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Overall / RO32 toggle */}
        <div style={{ display: "flex", background: "var(--surf2)", borderRadius: 12, padding: 4, gap: 4 }}>
          {([
            { key: "overall" as const, label: "Overall" },
            { key: "ro32" as const, label: "Round of 32" },
          ]).map((t) => {
            const active = view === t.key;
            return (
              <button
                key={t.key}
                onClick={() => switchView(t.key)}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer",
                  background: active ? "var(--n0)" : "transparent",
                  color: active ? "#fff" : "var(--n4)",
                  fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {view === "ro32" && (
          <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n5)", paddingLeft: 4 }}>
            RO32 round only — match points from predictions, nation bonus & live checkpoints. Excludes progression bonus & redraft penalties (clean slate at kickoff).
          </div>
        )}

        <Link
          href="/bracket"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            background: "var(--surf)", border: "1.5px solid var(--n0)", borderRadius: 14,
            padding: "13px 14px", textDecoration: "none",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 14, color: "var(--n0)", letterSpacing: 0.3 }}>
              🏆 Bracket contest
            </div>
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", marginTop: 2 }}>
              Who advances — separate standings
            </div>
          </div>
          <span style={{ color: "var(--n0)", fontSize: 20, flexShrink: 0 }}>›</span>
        </Link>

        <RankList rows={rows} currentUserId={currentUserId} />

        <div
          style={{
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 11,
            color: "var(--n5)",
            paddingLeft: 4,
          }}
        >
          n = nation bonus pts
        </div>

      </div>

      {/* Bottom tray */}
      <div
        style={{
          background: "var(--surf)",
          borderTop: "1px solid var(--n9)",
          padding: "12px 16px 14px",
          marginTop: 16,
          boxShadow: "0 -2px 12px rgba(14,23,38,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 12,
                color: "var(--n5)",
                marginBottom: 3,
              }}
            >
              Your standing
            </div>
            <div
              style={{
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 800,
                fontSize: 15,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                color: "var(--n0)",
              }}
            >
              {myCurrentRank !== null ? `#${myCurrentRank}` : "--"} · {myCurrentPoints}pts
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 12,
                color: "var(--n5)",
                marginBottom: 3,
              }}
            >
              {gapToLeader > 0 ? `${gapToLeader} pts behind ${rows[0]?.profile_name ?? "leader"}` : "You're leading! 🏆"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 24 }}>{myFlag}</span>
              <span
                style={{
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  color: "var(--n3)",
                }}
              >
                this round
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
