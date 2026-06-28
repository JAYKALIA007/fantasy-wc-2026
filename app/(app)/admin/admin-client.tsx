"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toISTWithDay } from "@/lib/utils/date";

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
  allow_late_predictions: boolean;
  auto_fetched: boolean;
  round_id: string;
  home_nation_id: number | null;
  away_nation_id: number | null;
  home_nation: { name: string } | null;
  away_nation: { name: string } | null;
  advancer_nation_id: number | null;
}

interface AdminClientProps {
  league: League;
  members: LeagueMember[];
  activeWindow: TransferWindow | null;
  r16RoundId: string;
  ro32RoundId: string;
  redraftWindow: { status: string; closes_at: string | null } | null;
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
  ro32RoundId,
  redraftWindow,
  currentUserId,
  inviteUrl,
}: AdminClientProps) {
  const router = useRouter();
  const [redraftBusy, setRedraftBusy] = useState(false);

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
  const RO32_ROUND_ID = ro32RoundId;
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [scoreInputs, setScoreInputs] = useState<Record<number, { home: string; away: string }>>({});
  // Knockout: which nation the admin marked as advancing, keyed by match id.
  const [advancerInputs, setAdvancerInputs] = useState<Record<number, number>>({});
  const [savingMatchId, setSavingMatchId] = useState<number | null>(null);
  const [matchStatusMsgs, setMatchStatusMsgs] = useState<Record<number, string>>({});
  const [matchSummaries, setMatchSummaries] = useState<Record<number, { total: number; correct: number; exact: number }>>({});

  // Checkpoint phases per RO32 match: phase rows keyed by match_id
  type PhaseRow = { phase: string; status: string; actual_home: number | null; actual_away: number | null };
  const [checkpointPhases, setCheckpointPhases] = useState<Record<number, PhaseRow[]>>({});
  // Checkpoint score inputs (admin enters actual): { home, away } per matchId-phase key
  const [cpInputs, setCpInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [cpBusy, setCpBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase
        .from("matches")
        .select(
          "id, kickoff_time, home_score, away_score, status, allow_late_predictions, auto_fetched, round_id, home_nation_id, away_nation_id, home_nation:nations!matches_home_nation_id_fkey(name, eliminated_in_round), away_nation:nations!matches_away_nation_id_fkey(name, eliminated_in_round)"
        )
        .in("round_id", [GROUP_STAGE_ROUND_ID, RO32_ROUND_ID])
        .order("kickoff_time", { ascending: false });

      type NationSel = { name: string; eliminated_in_round: string | null };
      const pickNation = (raw: unknown): NationSel | null =>
        Array.isArray(raw) ? ((raw[0] as NationSel | undefined) ?? null) : (raw as NationSel | null);

      const rows: MatchRow[] = (data ?? []).map((m) => {
        const homeNation = pickNation(m.home_nation);
        const awayNation = pickNation(m.away_nation);
        const roundId = m.round_id as string;
        const homeId = m.home_nation_id as number | null;
        const awayId = m.away_nation_id as number | null;
        // For knockout rows, the advancer is whichever team is NOT eliminated at
        // this round (derived from the persisted elimination tags).
        let advancer: number | null = null;
        if (roundId === RO32_ROUND_ID) {
          if (awayNation?.eliminated_in_round === "ro32" && homeId != null) advancer = homeId;
          else if (homeNation?.eliminated_in_round === "ro32" && awayId != null) advancer = awayId;
        }
        return {
          id: m.id as number,
          kickoff_time: m.kickoff_time as string,
          home_score: m.home_score as number | null,
          away_score: m.away_score as number | null,
          status: m.status as string,
          allow_late_predictions: (m.allow_late_predictions as boolean) ?? false,
          auto_fetched: (m.auto_fetched as boolean) ?? false,
          round_id: roundId,
          home_nation_id: homeId,
          away_nation_id: awayId,
          home_nation: homeNation ? { name: homeNation.name } : null,
          away_nation: awayNation ? { name: awayNation.name } : null,
          advancer_nation_id: advancer,
        };
      });
      // RO32 matches first (most are future kickoffs), then group stage.
      rows.sort((a, b) => {
        const ar = a.round_id === RO32_ROUND_ID ? 0 : 1;
        const br = b.round_id === RO32_ROUND_ID ? 0 : 1;
        if (ar !== br) return ar - br;
        return new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime();
      });
      setMatches(rows);
      // Seed advancer selections from persisted elimination state.
      setAdvancerInputs(() => {
        const seed: Record<number, number> = {};
        for (const r of rows) if (r.advancer_nation_id != null) seed[r.id] = r.advancer_nation_id;
        return seed;
      });
      setMatchesLoading(false);

      // Fetch checkpoint phases for RO32 matches
      const ro32Ids = rows.filter((r) => r.round_id === RO32_ROUND_ID).map((r) => r.id);
      if (ro32Ids.length > 0) {
        const { data: phases } = await supabase
          .from("match_checkpoint_phases")
          .select("match_id, phase, status, actual_home, actual_away")
          .in("match_id", ro32Ids);
        if (phases) {
          const byMatch: Record<number, PhaseRow[]> = {};
          for (const p of phases) {
            const mid = p.match_id as number;
            if (!byMatch[mid]) byMatch[mid] = [];
            byMatch[mid].push({ phase: p.phase as string, status: p.status as string, actual_home: p.actual_home as number | null, actual_away: p.actual_away as number | null });
          }
          setCheckpointPhases(byMatch);
        }
      }

      // Fetch prediction summaries for finished matches
      const finishedIds = rows.filter((r) => r.status === "finished").map((r) => r.id);
      if (finishedIds.length > 0) {
        void Promise.all(
          finishedIds.map((id) =>
            fetch(`/api/match-predictions-summary?match_id=${id}`)
              .then((r) => r.json() as Promise<{ total: number; correct: number; exact: number }>)
              .then((d) => ({ id, d }))
              .catch(() => null)
          )
        ).then((results) => {
          const map: Record<number, { total: number; correct: number; exact: number }> = {};
          for (const res of results) {
            if (res) map[res.id] = res.d;
          }
          setMatchSummaries(map);
        });
      }
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

  async function adminCheckpointPhase(matchId: number, phase: string, action: "open" | "close" | "score") {
    const key = `${matchId}-${phase}`;
    setCpBusy((prev) => ({ ...prev, [key]: true }));
    try {
      const body: Record<string, unknown> = { match_id: matchId, phase, action };
      if (action === "score") {
        const inp = cpInputs[key];
        const ah = inp ? parseInt(inp.home, 10) : NaN;
        const aa = inp ? parseInt(inp.away, 10) : NaN;
        if (isNaN(ah) || isNaN(aa)) {
          setStatusMsg("Error: Enter valid actual scores.");
          return;
        }
        body.actual_home = ah;
        body.actual_away = aa;
      }
      const res = await fetch("/api/admin/checkpoint-phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; scored?: number };
      if (!res.ok) {
        setStatusMsg(`Error: ${data.error ?? "Unknown"}`);
      } else {
        // Update local phase state
        setCheckpointPhases((prev) => {
          const existing = prev[matchId] ?? [];
          const newStatus = action === "open" ? "open" : action === "close" ? "closed" : "scored";
          const found = existing.find((p) => p.phase === phase);
          const inp = cpInputs[key];
          const ah = inp ? parseInt(inp.home, 10) : null;
          const aa = inp ? parseInt(inp.away, 10) : null;
          if (found) {
            return {
              ...prev,
              [matchId]: existing.map((p) =>
                p.phase === phase
                  ? { ...p, status: newStatus, actual_home: action === "score" ? ah : p.actual_home, actual_away: action === "score" ? aa : p.actual_away }
                  : p
              ),
            };
          } else {
            return {
              ...prev,
              [matchId]: [...existing, { phase, status: newStatus, actual_home: null, actual_away: null }],
            };
          }
        });
        if (action === "score") {
          setStatusMsg(`Scored! ${data.scored ?? 0} prediction(s) updated.`);
        }
      }
    } finally {
      setCpBusy((prev) => ({ ...prev, [key]: false }));
    }
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
    const match = matches.find((m) => m.id === matchId);
    const isKnockout = match?.round_id === RO32_ROUND_ID;
    const advancer = advancerInputs[matchId];
    if (isKnockout && advancer == null) {
      setMatchStatusMsgs((prev) => ({ ...prev, [matchId]: "Error: Tap who advanced." }));
      return;
    }
    setSavingMatchId(matchId);
    setMatchStatusMsgs((prev) => ({ ...prev, [matchId]: "" }));
    try {
      const res = await fetch("/api/admin/match-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          home_score: home,
          away_score: away,
          ...(isKnockout ? { advancer_nation_id: advancer } : {}),
        }),
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
              ? {
                  ...m,
                  home_score: home,
                  away_score: away,
                  status: "finished",
                  advancer_nation_id: isKnockout ? advancer : m.advancer_nation_id,
                }
              : m
          )
        );
        // Refresh summary for this match
        void fetch(`/api/match-predictions-summary?match_id=${matchId}`)
          .then((r) => r.json() as Promise<{ total: number; correct: number; exact: number }>)
          .then((d) => setMatchSummaries((prev) => ({ ...prev, [matchId]: d })))
          .catch(() => null);
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

  async function toggleLatePredictions(matchId: number, current: boolean) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const deadline = current ? null : new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("matches")
      .update({ allow_late_predictions: !current, prediction_deadline: deadline })
      .eq("id", matchId);
    if (error) {
      setStatusMsg(`Error: ${error.message}`);
    } else {
      setMatches((prev) =>
        prev.map((m) => m.id === matchId ? { ...m, allow_late_predictions: !current } : m)
      );
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

  async function toggleRedraftWindow(action: "open" | "close") {
    setRedraftBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/redraft-window", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league_id: league.id, round_id: ro32RoundId, action }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        setStatusMsg(`Error: ${data.error ?? "Unknown error"}`);
      } else {
        setStatusMsg(action === "open" ? "RO32 re-draft window opened." : "RO32 re-draft window closed.");
        router.refresh();
      }
    } finally {
      setRedraftBusy(false);
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
            Match Results
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
              No matches found.
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
              const isRo32 = m.round_id === RO32_ROUND_ID;
              const showScoring =
                (isPast && !isFinished) || (isFinished && scoreInputs[m.id] !== undefined);
              const advancerName =
                m.advancer_nation_id == null
                  ? null
                  : m.advancer_nation_id === m.home_nation_id
                  ? m.home_nation?.name ?? null
                  : m.away_nation?.name ?? null;

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
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {isRo32 && (
                          <span
                            style={{
                              fontSize: 10,
                              background: "var(--gold-bg)",
                              color: "var(--gold-text)",
                              padding: "1px 6px",
                              borderRadius: 6,
                              fontFamily: "var(--font-inter), sans-serif",
                              fontWeight: 700,
                              letterSpacing: 0.5,
                            }}
                          >
                            RO32
                          </span>
                        )}
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

                    {/* Late predictions toggle */}
                    {!isFinished && (
                      <button
                        onClick={() => void toggleLatePredictions(m.id, m.allow_late_predictions)}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 8,
                          background: m.allow_late_predictions ? "rgba(245,181,10,0.15)" : "var(--surf2)",
                          border: m.allow_late_predictions ? "1.5px solid var(--gold)" : "1.5px solid var(--n8)",
                          color: m.allow_late_predictions ? "var(--gold-text)" : "var(--n5)",
                          fontFamily: "var(--font-saira), sans-serif",
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {m.allow_late_predictions ? "⚡ Late ON" : "⚡ Late"}
                      </button>
                    )}

                  {/* Score display for finished matches */}
                    {isFinished && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 4,
                        }}
                      >
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
                        {m.auto_fetched && (
                          <span
                            style={{
                              fontFamily: "var(--font-inter), sans-serif",
                              fontSize: 11,
                              color: "#b45309",
                              background: "#fef3c7",
                              border: "1px solid #fcd34d",
                              borderRadius: 6,
                              padding: "2px 8px",
                            }}
                          >
                            Auto-fetched from ESPN. If incorrect, edit manually.
                          </span>
                        )}
                        {matchSummaries[m.id] && matchSummaries[m.id].total > 0 && (
                          <span
                            style={{
                              fontFamily: "var(--font-inter), sans-serif",
                              fontSize: 11,
                              color: "var(--n5)",
                            }}
                          >
                            {matchSummaries[m.id].total} predictions · {matchSummaries[m.id].correct} correct · {matchSummaries[m.id].exact} exact
                          </span>
                        )}
                        {isRo32 && advancerName && (
                          <span
                            style={{
                              fontFamily: "var(--font-inter), sans-serif",
                              fontSize: 11,
                              fontWeight: 600,
                              color: "var(--g0)",
                            }}
                          >
                            ✓ {advancerName} advanced
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Knockout: who advanced? The other team is eliminated. */}
                  {isRo32 && showScoring && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={labelStyle}>Who advanced?</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[
                          { id: m.home_nation_id, name: m.home_nation?.name },
                          { id: m.away_nation_id, name: m.away_nation?.name },
                        ].map((team) => {
                          const selected = team.id != null && advancerInputs[m.id] === team.id;
                          return (
                            <button
                              key={team.id ?? "?"}
                              onClick={() =>
                                team.id != null &&
                                setAdvancerInputs((prev) => ({ ...prev, [m.id]: team.id as number }))
                              }
                              style={{
                                flex: 1,
                                padding: "8px 10px",
                                borderRadius: 8,
                                background: selected ? "var(--g3)" : "var(--surf2)",
                                color: selected ? "#fff" : "var(--n4)",
                                border: selected ? "1.5px solid var(--g3)" : "1.5px solid var(--n8)",
                                fontFamily: "var(--font-saira), sans-serif",
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: "pointer",
                              }}
                            >
                              {selected ? "✓ " : ""}{team.name ?? "TBD"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Score input for past-kickoff scheduled matches or editing finished matches */}
                  {showScoring ? (
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

                  {/* Checkpoint phases — only for RO32 matches (past kickoff) */}
                  {isRo32 && (isPast || (checkpointPhases[m.id]?.length ?? 0) > 0) && !isFinished && (() => {
                    const phases = checkpointPhases[m.id] ?? [];
                    // Always show all four phases. The cron auto-opens et/pens
                    // when ESPN surfaces the end-of-90'/end-of-ET break with the
                    // score level, but those rows don't exist until then — so the
                    // admin "Open" button must always be available as the manual
                    // backup if ESPN never exposes that brief break state.
                    const PHASE_LABELS: Record<string, string> = { h1: "HT (h1)", h2: "90' (h2)", et: "ET", pens: "Pens" };
                    const toShow = ["h1", "h2", "et", "pens"];
                    return (
                      <div style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: 8, marginTop: 2 }}>
                        <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, color: "var(--n5)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                          Live Checkpoints
                        </div>
                        {toShow.map((ph) => {
                          const row = phases.find((p) => p.phase === ph);
                          const status = row?.status ?? "pending";
                          const key = `${m.id}-${ph}`;
                          const busy = cpBusy[key] ?? false;
                          const inp = cpInputs[key] ?? { home: String(row?.actual_home ?? ""), away: String(row?.actual_away ?? "") };
                          const statusColor = status === "open" ? "var(--gold)" : status === "scored" ? "var(--g3)" : "var(--n6)";
                          return (
                            <div key={ph} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n4)" }}>
                                  {PHASE_LABELS[ph] ?? ph}
                                  <span style={{ marginLeft: 6, fontSize: 10, color: statusColor, fontWeight: 700 }}>[{status}]</span>
                                  {status === "scored" && row?.actual_home != null && (
                                    <span style={{ marginLeft: 6, color: "var(--g3)", fontSize: 11 }}>{row.actual_home}–{row.actual_away}</span>
                                  )}
                                </span>
                                <div style={{ display: "flex", gap: 6 }}>
                                  {status === "pending" && (
                                    <button onClick={() => void adminCheckpointPhase(m.id, ph, "open")} disabled={busy}
                                      style={{ padding: "3px 10px", borderRadius: 6, background: "var(--g3)", color: "#fff", fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, border: "none", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
                                      Open
                                    </button>
                                  )}
                                  {status === "open" && (
                                    <button onClick={() => void adminCheckpointPhase(m.id, ph, "close")} disabled={busy}
                                      style={{ padding: "3px 10px", borderRadius: 6, background: "var(--r2)", color: "#fff", fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, border: "none", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
                                      Close
                                    </button>
                                  )}
                                </div>
                              </div>
                              {(status === "closed" || status === "scored" || status === "open") && (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input type="number" min={0} max={20} value={inp.home}
                                    onChange={(e) => setCpInputs((prev) => ({ ...prev, [key]: { ...inp, home: e.target.value } }))}
                                    placeholder="H" style={{ width: 44, padding: "5px 6px", borderRadius: 6, border: "1px solid var(--n8)", background: "var(--surf2)", color: "var(--n0)", fontFamily: "var(--font-inter), sans-serif", fontSize: 13, textAlign: "center", outline: "none" }} />
                                  <span style={{ color: "var(--n5)", fontWeight: 700 }}>–</span>
                                  <input type="number" min={0} max={20} value={inp.away}
                                    onChange={(e) => setCpInputs((prev) => ({ ...prev, [key]: { ...inp, away: e.target.value } }))}
                                    placeholder="A" style={{ width: 44, padding: "5px 6px", borderRadius: 6, border: "1px solid var(--n8)", background: "var(--surf2)", color: "var(--n0)", fontFamily: "var(--font-inter), sans-serif", fontSize: 13, textAlign: "center", outline: "none" }} />
                                  <button onClick={() => void adminCheckpointPhase(m.id, ph, "score")} disabled={busy}
                                    style={{ padding: "5px 12px", borderRadius: 6, background: "var(--g3)", color: "#fff", fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 12, border: "none", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
                                    {busy ? "…" : "Save & Score"}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
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

        {/* Re-draft Window · RO32 */}
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
            Re-draft Window · RO32
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: redraftWindow?.status === "open" ? "var(--g3)" : "var(--n6)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: redraftWindow?.status === "open" ? "var(--g0)" : "var(--n5)" }}>
              {redraftWindow?.status === "open"
                ? redraftWindow.closes_at
                  ? `Open · closes ${toISTWithDay(redraftWindow.closes_at)}`
                  : "Open"
                : "Currently closed"}
            </span>
          </div>

          <button
            onClick={() => toggleRedraftWindow(redraftWindow?.status === "open" ? "close" : "open")}
            disabled={redraftBusy}
            style={{
              padding: "11px 0",
              width: "100%",
              borderRadius: 10,
              background: redraftWindow?.status === "open" ? "var(--r2)" : "var(--g3)",
              color: "#fff",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              cursor: redraftBusy ? "not-allowed" : "pointer",
              opacity: redraftBusy ? 0.7 : 1,
            }}
          >
            {redraftBusy ? "…" : redraftWindow?.status === "open" ? "Close Re-draft Now" : "Open Re-draft Now (24h)"}
          </button>
        </div>
      </div>
    </div>
  );
}
