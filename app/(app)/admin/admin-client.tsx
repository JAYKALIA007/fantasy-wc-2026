"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface LeagueMember {
  id: string;
  user_id: string;
  profile_name: string;
  joined_at: string;
  avatars: { initials: string; position: string } | null;
}

interface TransferWindow {
  id: string;
  round_id: string;
  window_number: number;
  opens_at: string;
  closes_at: string;
  manually_triggered: boolean;
}

interface League {
  id: string;
  name: string;
  invite_code: string;
  invite_closed: boolean;
  creator_id: string;
}

interface MatchRow {
  id: number;
  kickoff_time: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  home_nation: { name: string } | null;
  away_nation: { name: string } | null;
}

interface AdminClientProps {
  league: League;
  members: LeagueMember[];
  activeWindow: TransferWindow | null;
  r16RoundId: string;
  currentUserId: string;
  inviteUrl: string;
}

const posColors: Record<string, string> = {
  gk: "#e07b00",
  def: "#2459b8",
  mid: "#7140c8",
  fwd: "#c82030",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function AdminClient({
  league,
  members,
  activeWindow,
  r16RoundId,
  currentUserId,
  inviteUrl,
}: AdminClientProps) {
  const router = useRouter();

  const [leagueName, setLeagueName] = useState(league.name);
  const [nameSaving, setNameSaving] = useState(false);
  const [inviteClosed, setInviteClosed] = useState(league.invite_closed);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [windowBusy, setWindowBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Match Results state
  const GROUP_STAGE_ROUND_ID = "a0000000-0000-0000-0000-000000000001";
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [scoreInputs, setScoreInputs] = useState<Record<number, { home: string; away: string }>>({});
  const [savingMatchId, setSavingMatchId] = useState<number | null>(null);
  const [matchStatusMsgs, setMatchStatusMsgs] = useState<Record<number, string>>({});

  useEffect(() => {
    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase
        .from("matches")
        .select(
          "id, kickoff_time, home_score, away_score, status, home_nation:nations!matches_home_nation_id_fkey(name), away_nation:nations!matches_away_nation_id_fkey(name)"
        )
        .eq("round_id", GROUP_STAGE_ROUND_ID)
        .order("kickoff_time", { ascending: false });

      const rows: MatchRow[] = (data ?? []).map((m) => {
        const homeRaw = m.home_nation as unknown;
        const awayRaw = m.away_nation as unknown;
        const homeNation = Array.isArray(homeRaw)
          ? (homeRaw[0] as { name: string } | undefined) ?? null
          : (homeRaw as { name: string } | null);
        const awayNation = Array.isArray(awayRaw)
          ? (awayRaw[0] as { name: string } | undefined) ?? null
          : (awayRaw as { name: string } | null);
        return {
          id: m.id as number,
          kickoff_time: m.kickoff_time as string,
          home_score: m.home_score as number | null,
          away_score: m.away_score as number | null,
          status: m.status as string,
          home_nation: homeNation,
          away_nation: awayNation,
        };
      });
      setMatches(rows);
      setMatchesLoading(false);
    })();
  }, []);

  function formatKickoffIST(iso: string): string {
    const d = new Date(iso);
    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    return d.toLocaleString("en-IN", options) + " IST";
  }

  async function saveMatchScore(matchId: number) {
    const input = scoreInputs[matchId];
    if (!input) return;
    const home = parseInt(input.home, 10);
    const away = parseInt(input.away, 10);
    if (isNaN(home) || isNaN(away)) {
      setMatchStatusMsgs((prev) => ({ ...prev, [matchId]: "Error: Enter valid scores." }));
      return;
    }
    setSavingMatchId(matchId);
    setMatchStatusMsgs((prev) => ({ ...prev, [matchId]: "" }));
    try {
      const res = await fetch("/api/admin/match-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, home_score: home, away_score: away }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setMatchStatusMsgs((prev) => ({ ...prev, [matchId]: `Error: ${data.error ?? "Unknown error"}` }));
      } else {
        setMatchStatusMsgs((prev) => ({ ...prev, [matchId]: "Saved!" }));
        // Update local match state
        setMatches((prev) =>
          prev.map((m) =>
            m.id === matchId
              ? { ...m, home_score: home, away_score: away, status: "finished" }
              : m
          )
        );
        setScoreInputs((prev) => {
          const next = { ...prev };
          delete next[matchId];
          return next;
        });
      }
    } finally {
      setSavingMatchId(null);
    }
  }

  // Compute full invite URL on client
  const fullInviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join?code=${league.invite_code}`
      : inviteUrl;

  async function saveName() {
    setNameSaving(true);
    setStatusMsg(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase
        .from("leagues")
        .update({ name: leagueName })
        .eq("id", league.id);
      if (error) {
        setStatusMsg(`Error: ${error.message}`);
      } else {
        setStatusMsg("League name saved.");
        router.refresh();
      }
    } finally {
      setNameSaving(false);
    }
  }

  async function toggleInvite() {
    setInviteSaving(true);
    setStatusMsg(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const newValue = !inviteClosed;
      const { error } = await supabase
        .from("leagues")
        .update({ invite_closed: newValue })
        .eq("id", league.id);
      if (error) {
        setStatusMsg(`Error: ${error.message}`);
      } else {
        setInviteClosed(newValue);
        setStatusMsg(newValue ? "Invite link closed." : "Invite link opened.");
      }
    } finally {
      setInviteSaving(false);
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(fullInviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function kickMember(memberId: string, userId: string) {
    if (!confirm("Remove this member from the league?")) return;
    setKickingId(memberId);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/kick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, league_id: league.id }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        setStatusMsg(`Error: ${data.error ?? "Unknown error"}`);
      } else {
        setStatusMsg("Member removed.");
        router.refresh();
      }
    } finally {
      setKickingId(null);
    }
  }

  async function toggleTransferWindow(action: "open" | "close") {
    setWindowBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/transfer-window", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league_id: league.id, round_id: r16RoundId, action }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        setStatusMsg(`Error: ${data.error ?? "Unknown error"}`);
      } else {
        setStatusMsg(action === "open" ? "Transfer window opened for 24h." : "Transfer window closed.");
        router.refresh();
      }
    } finally {
      setWindowBusy(false);
    }
  }

  const sectionStyle: React.CSSProperties = {
    background: "var(--surf)",
    borderRadius: 14,
    padding: "16px",
    boxShadow: "var(--sh-sm)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-saira), sans-serif",
    fontWeight: 700,
    fontSize: 11,
    color: "var(--n5)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "var(--n0)",
          padding: "14px 16px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-saira), sans-serif",
            fontWeight: 800,
            fontSize: 18,
            color: "#fff",
          }}
        >
          Admin
        </span>
        <div
          style={{
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          League Creator
        </div>
      </div>

      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Status message */}
        {statusMsg && (
          <div
            style={{
              background: statusMsg.startsWith("Error") ? "var(--rbg)" : "var(--gbg)",
              color: statusMsg.startsWith("Error") ? "var(--r1)" : "var(--g0)",
              padding: "10px 14px",
              borderRadius: 10,
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 13,
            }}
          >
            {statusMsg}
          </div>
        )}

        {/* League Settings */}
        <div style={sectionStyle}>
          <div
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--n0)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            League Settings
          </div>

          {/* League name */}
          <div>
            <div style={labelStyle}>League Name</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1.5px solid var(--n8)",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 14,
                  color: "var(--n0)",
                  background: "var(--surf2)",
                  outline: "none",
                }}
              />
              <button
                onClick={saveName}
                disabled={nameSaving}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  background: "var(--g3)",
                  color: "#fff",
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  border: "none",
                  cursor: nameSaving ? "not-allowed" : "pointer",
                  opacity: nameSaving ? 0.7 : 1,
                }}
              >
                {nameSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          {/* Invite link */}
          <div>
            <div style={labelStyle}>Invite Link</div>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--surf2)",
                border: "1.5px solid var(--n8)",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 12,
                color: "var(--n4)",
                wordBreak: "break-all",
                marginBottom: 8,
              }}
            >
              {fullInviteUrl}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={copyInvite}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: 10,
                  background: copied ? "var(--g2)" : "var(--n2)",
                  color: "#fff",
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {copied ? "Copied!" : "Copy Link"}
              </button>
              <button
                onClick={toggleInvite}
                disabled={inviteSaving}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: 10,
                  background: inviteClosed ? "var(--g3)" : "var(--r2)",
                  color: "#fff",
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  border: "none",
                  cursor: inviteSaving ? "not-allowed" : "pointer",
                  opacity: inviteSaving ? 0.7 : 1,
                }}
              >
                {inviteSaving ? "…" : inviteClosed ? "Open Invite" : "Close Invite"}
              </button>
            </div>
            {inviteClosed && (
              <div
                style={{
                  marginTop: 6,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 12,
                  color: "var(--r2)",
                }}
              >
                Invite link is currently closed — new members cannot join.
              </div>
            )}
          </div>
        </div>

        {/* Players */}
        <div style={sectionStyle}>
          <div
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--n0)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Players ({members.length})
          </div>

          {members.map((m, idx) => {
            const posColor = m.avatars
              ? (posColors[m.avatars.position] ?? "#566278")
              : "#566278";
            const isCreator = m.user_id === currentUserId;

            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  paddingTop: idx === 0 ? 0 : 10,
                  borderTop: idx === 0 ? "none" : "1px solid var(--n9)",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: posColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontFamily: "var(--font-anton), sans-serif",
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {m.avatars?.initials ?? "?"}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-saira), sans-serif",
                      fontWeight: 600,
                      fontSize: 14,
                      color: "var(--n0)",
                    }}
                  >
                    {m.profile_name}
                    {isCreator && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          background: "var(--gold-bg)",
                          color: "var(--gold-text)",
                          padding: "1px 6px",
                          borderRadius: 6,
                          fontFamily: "var(--font-inter), sans-serif",
                          fontWeight: 600,
                        }}
                      >
                        Creator
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 12,
                      color: "var(--n5)",
                    }}
                  >
                    Joined {formatDate(m.joined_at)}
                  </div>
                </div>
                {!isCreator && (
                  <button
                    onClick={() => kickMember(m.id, m.user_id)}
                    disabled={kickingId === m.id}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      background: kickingId === m.id ? "var(--n8)" : "var(--rbg)",
                      color: "var(--r1)",
                      fontFamily: "var(--font-saira), sans-serif",
                      fontWeight: 700,
                      fontSize: 12,
                      border: "1.5px solid var(--r2)",
                      cursor: kickingId === m.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {kickingId === m.id ? "…" : "Kick"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Match Results */}
        <div style={sectionStyle}>
          <div
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--n0)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Match Results · Group Stage
          </div>

          {matchesLoading ? (
            <div
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 13,
                color: "var(--n5)",
              }}
            >
              Loading matches…
            </div>
          ) : matches.length === 0 ? (
            <div
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 13,
                color: "var(--n5)",
              }}
            >
              No group stage matches found.
            </div>
          ) : (
            matches.map((m, idx) => {
              const kickoff = new Date(m.kickoff_time);
              const now = new Date();
              const isPast = kickoff < now;
              const isFinished = m.status === "finished";
              const isEditing =
                scoreInputs[m.id] !== undefined && !isFinished;
              const input = scoreInputs[m.id] ?? { home: "", away: "" };
              const msg = matchStatusMsgs[m.id];

              return (
                <div
                  key={m.id}
                  style={{
                    paddingTop: idx === 0 ? 0 : 10,
                    borderTop: idx === 0 ? "none" : "1px solid var(--n9)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {/* Match label row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-saira), sans-serif",
                          fontWeight: 600,
                          fontSize: 14,
                          color: "var(--n0)",
                        }}
                      >
                        {m.home_nation?.name ?? "TBD"} vs {m.away_nation?.name ?? "TBD"}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-inter), sans-serif",
                          fontSize: 11,
                          color: "var(--n5)",
                          marginTop: 2,
                        }}
                      >
                        {formatKickoffIST(m.kickoff_time)}
                      </div>
                    </div>

                    {/* Score display for finished matches */}
                    {isFinished && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-anton), sans-serif",
                            fontSize: 18,
                            color: "var(--g3)",
                          }}
                        >
                          {m.home_score ?? 0} – {m.away_score ?? 0}
                        </span>
                        <button
                          onClick={() =>
                            setScoreInputs((prev) => ({
                              ...prev,
                              [m.id]: {
                                home: String(m.home_score ?? 0),
                                away: String(m.away_score ?? 0),
                              },
                            }))
                          }
                          style={{
                            padding: "4px 10px",
                            borderRadius: 8,
                            background: "var(--surf2)",
                            border: "1.5px solid var(--n8)",
                            color: "var(--n4)",
                            fontFamily: "var(--font-saira), sans-serif",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Score input for past-kickoff scheduled matches or editing finished matches */}
                  {(isPast && !isFinished) || (isFinished && scoreInputs[m.id] !== undefined) ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={input.home}
                        onChange={(e) =>
                          setScoreInputs((prev) => ({
                            ...prev,
                            [m.id]: { ...input, home: e.target.value },
                          }))
                        }
                        placeholder="Home"
                        style={{
                          width: 60,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1.5px solid var(--n8)",
                          fontFamily: "var(--font-inter), sans-serif",
                          fontSize: 14,
                          color: "var(--n0)",
                          background: "var(--surf2)",
                          outline: "none",
                          textAlign: "center",
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--font-saira), sans-serif",
                          fontWeight: 700,
                          color: "var(--n5)",
                        }}
                      >
                        –
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={input.away}
                        onChange={(e) =>
                          setScoreInputs((prev) => ({
                            ...prev,
                            [m.id]: { ...input, away: e.target.value },
                          }))
                        }
                        placeholder="Away"
                        style={{
                          width: 60,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1.5px solid var(--n8)",
                          fontFamily: "var(--font-inter), sans-serif",
                          fontSize: 14,
                          color: "var(--n0)",
                          background: "var(--surf2)",
                          outline: "none",
                          textAlign: "center",
                        }}
                      />
                      <button
                        onClick={() => void saveMatchScore(m.id)}
                        disabled={savingMatchId === m.id}
                        style={{
                          flex: 1,
                          padding: "8px 0",
                          borderRadius: 8,
                          background: "var(--g3)",
                          color: "#fff",
                          fontFamily: "var(--font-saira), sans-serif",
                          fontWeight: 700,
                          fontSize: 13,
                          border: "none",
                          cursor: savingMatchId === m.id ? "not-allowed" : "pointer",
                          opacity: savingMatchId === m.id ? 0.7 : 1,
                        }}
                      >
                        {savingMatchId === m.id ? "Saving…" : "Save Result"}
                      </button>
                      {isFinished && (
                        <button
                          onClick={() =>
                            setScoreInputs((prev) => {
                              const next = { ...prev };
                              delete next[m.id];
                              return next;
                            })
                          }
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "transparent",
                            border: "1.5px solid var(--n8)",
                            color: "var(--n5)",
                            fontFamily: "var(--font-saira), sans-serif",
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ) : null}

                  {/* Per-match status message */}
                  {msg && (
                    <div
                      style={{
                        fontFamily: "var(--font-inter), sans-serif",
                        fontSize: 12,
                        color: msg.startsWith("Error") ? "var(--r1)" : "var(--g3)",
                      }}
                    >
                      {msg}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Transfer Window */}
        <div style={sectionStyle}>
          <div
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--n0)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Transfer Window · R16
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: activeWindow ? "var(--g3)" : "var(--n6)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 14,
                color: activeWindow ? "var(--g0)" : "var(--n5)",
              }}
            >
              {activeWindow
                ? `Open · closes ${formatDate(activeWindow.closes_at)}`
                : "Currently closed"}
            </span>
          </div>

          <button
            onClick={() => toggleTransferWindow(activeWindow ? "close" : "open")}
            disabled={windowBusy}
            style={{
              padding: "11px 0",
              borderRadius: 10,
              background: activeWindow ? "var(--r2)" : "var(--g3)",
              color: "#fff",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              cursor: windowBusy ? "not-allowed" : "pointer",
              opacity: windowBusy ? 0.7 : 1,
            }}
          >
            {windowBusy
              ? "…"
              : activeWindow
              ? "Close Window Now"
              : "Open Window Now (24h)"}
          </button>
        </div>
      </div>
    </div>
  );
}
