"use client";

import { useState } from "react";
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
