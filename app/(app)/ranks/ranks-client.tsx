"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface RankRow {
  user_id: string;
  total_points: number;
  profile_name: string;
  initials: string;
  position: string;
}

interface Props {
  initialRows: RankRow[];
  initialFantasyRows: RankRow[];
  currentUserId: string;
  leagueName: string;
  memberCount: number;
  leagueId: string;
  roundId: string;
  myRank: number | null;
  myPoints: number;
  myFantasyRank: number | null;
  myFantasyPoints: number;
  myInitials: string;
  myPosition: string;
  leaderPoints: number;
  fantasyLeaderPoints: number;
}

const posColors: Record<string, string> = {
  gk: "#e07b00",
  def: "#2459b8",
  mid: "#7140c8",
  fwd: "#c82030",
  neu: "#566278",
};

const roundLabels: Record<string, string> = {
  "a0000000-0000-0000-0000-000000000001": "GS",
  "a0000000-0000-0000-0000-000000000002": "R16",
};

function Avatar({
  initials,
  position,
  size,
}: {
  initials: string;
  position: string;
  size: number;
}) {
  const color = posColors[position] ?? "#566278";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontFamily: "var(--font-anton), sans-serif",
        fontSize: size * 0.38,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function MovementArrow({ movement }: { movement: "up" | "dn" | "eq" }) {
  if (movement === "up") {
    return <span style={{ color: "var(--g3)", fontSize: 13 }}>▲</span>;
  }
  if (movement === "dn") {
    return <span style={{ color: "var(--r2)", fontSize: 13 }}>▼</span>;
  }
  return <span style={{ color: "var(--n6)", fontSize: 13 }}>—</span>;
}

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
        const movement: "up" | "dn" | "eq" = "eq";

        return (
          <div
            key={row.user_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderBottom: idx < rows.length - 1 ? "1px solid var(--n9)" : "none",
              background: isMe ? "rgba(0,184,92,0.07)" : "transparent",
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

            {/* Avatar */}
            <Avatar initials={row.initials} position={row.position} size={28} />

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

            {/* Movement + points */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <MovementArrow movement={movement} />
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
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function RanksClient({
  initialRows,
  initialFantasyRows,
  currentUserId,
  leagueName,
  memberCount,
  leagueId,
  roundId,
  myRank,
  myPoints,
  myFantasyRank,
  myFantasyPoints,
  myInitials,
  myPosition,
  leaderPoints,
  fantasyLeaderPoints,
}: Props) {
  const [rows, setRows] = useState<RankRow[]>(initialRows);
  const [fantasyRows, setFantasyRows] = useState<RankRow[]>(initialFantasyRows);
  const [activeTab, setActiveTab] = useState<"prediction" | "fantasy">("prediction");

  const supabase = createClient();

  // Prediction scores realtime
  useEffect(() => {
    const channel = supabase
      .channel("prediction_round_scores_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prediction_round_scores",
          filter: `league_id=eq.${leagueId}`,
        },
        () => {
          void fetchLatestPredictionScores();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, roundId]);

  // Fantasy scores realtime
  useEffect(() => {
    const channel = supabase
      .channel("fantasy_round_scores_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fantasy_round_scores",
          filter: `league_id=eq.${leagueId}`,
        },
        () => {
          void fetchLatestFantasyScores();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, roundId]);

  const fetchLatestPredictionScores = async () => {
    const { data: scores } = await supabase
      .from("prediction_round_scores")
      .select("user_id, total_points")
      .eq("league_id", leagueId)
      .eq("round_id", roundId)
      .order("total_points", { ascending: false });

    if (scores) {
      setRows((prev) => {
        const updated = prev.map((row) => {
          const score = (scores as { user_id: string; total_points: number }[]).find(
            (s) => s.user_id === row.user_id
          );
          return score ? { ...row, total_points: score.total_points } : row;
        });
        return [...updated].sort((a, b) => b.total_points - a.total_points);
      });
    }
  };

  const fetchLatestFantasyScores = async () => {
    const { data: scores } = await supabase
      .from("fantasy_round_scores")
      .select("user_id, total_points")
      .eq("league_id", leagueId)
      .eq("round_id", roundId)
      .order("total_points", { ascending: false });

    if (scores) {
      setFantasyRows((prev) => {
        const updated = prev.map((row) => {
          const score = (scores as { user_id: string; total_points: number }[]).find(
            (s) => s.user_id === row.user_id
          );
          return score ? { ...row, total_points: score.total_points } : row;
        });
        return [...updated].sort((a, b) => b.total_points - a.total_points);
      });
    }
  };

  const activeRows = activeTab === "prediction" ? rows : fantasyRows;

  const myCurrentRow = activeRows.find((r) => r.user_id === currentUserId);
  const myCurrentRank = myCurrentRow
    ? activeRows.indexOf(myCurrentRow) + 1
    : activeTab === "prediction"
    ? myRank
    : myFantasyRank;
  const myCurrentPoints =
    myCurrentRow?.total_points ??
    (activeTab === "prediction" ? myPoints : myFantasyPoints);
  const currentLeaderPoints =
    activeRows[0]?.total_points ??
    (activeTab === "prediction" ? leaderPoints : fantasyLeaderPoints);
  const gapToLeader = currentLeaderPoints - myCurrentPoints;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
          flex: 1,
          overflowY: "auto",
          padding: "16px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Segment control */}
        <div
          style={{
            display: "flex",
            background: "var(--n2)",
            borderRadius: 12,
            padding: 3,
          }}
        >
          {(["prediction", "fantasy"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 10,
                border: "none",
                background: activeTab === tab ? "#fff" : "transparent",
                color: activeTab === tab ? "var(--n0)" : "var(--n6)",
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "background 0.15s",
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <p
          style={{
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 12,
            color: "var(--n5)",
            margin: 0,
            padding: "0 2px",
          }}
        >
          Two separate competitions — each has its own winner.
        </p>

        <RankList rows={activeRows} currentUserId={currentUserId} />

        <div style={{ flex: 1 }} />
      </div>

      {/* Bottom tray */}
      <div
        style={{
          background: "var(--surf)",
          borderTop: "1px solid var(--n9)",
          padding: "12px 16px 14px",
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
              {gapToLeader > 0 ? `${gapToLeader} pts from leader` : "You're leading!"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Avatar initials={myInitials} position={myPosition} size={20} />
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
