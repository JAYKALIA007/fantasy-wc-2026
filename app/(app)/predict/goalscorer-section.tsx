"use client";

import { useState } from "react";
import type { WagerPlayer, RevealPick } from "./page";

const POS_LABEL: Record<string, string> = { fwd: "FWD", mid: "MID", def: "DEF", gk: "GK" };

export interface MyWager {
  player_id: number;
  status: string;
}

export default function GoalscorerSection({
  matchId,
  locked,
  homeName,
  awayName,
  roster,
  myWagers,
  reveal,
  available,
  onPlace,
  onCancel,
}: {
  matchId: number;
  locked: boolean;
  homeName: string;
  awayName: string;
  roster: { home: WagerPlayer[]; away: WagerPlayer[] };
  myWagers: MyWager[];
  reveal: RevealPick[];
  available: number;
  onPlace: (matchId: number, playerId: number) => Promise<string | null>;
  onCancel: (matchId: number, playerId: number) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const nameById = new Map<number, string>();
  for (const p of [...roster.home, ...roster.away]) nameById.set(p.id, p.name);

  const backedIds = new Set(myWagers.map((w) => w.player_id));
  const canAfford = available >= 10;

  const handlePlace = async () => {
    if (selected === "" || busy) return;
    setBusy(true);
    setErr(null);
    const error = await onPlace(matchId, selected as number);
    if (error) setErr(error);
    else setSelected("");
    setBusy(false);
  };

  const handleCancel = async (playerId: number) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const error = await onCancel(matchId, playerId);
    if (error) setErr(error);
    setBusy(false);
  };

  const renderOptions = (team: string, players: WagerPlayer[]) => (
    <optgroup label={team}>
      {players
        .filter((p) => !backedIds.has(p.id))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {POS_LABEL[p.position] ?? p.position}
          </option>
        ))}
    </optgroup>
  );

  const statusBadge = (status: string) => {
    if (status === "won") return <span style={{ color: "var(--g3)", fontWeight: 700 }}>✓ +15</span>;
    if (status === "lost") return <span style={{ color: "var(--r3)", fontWeight: 700 }}>✗ −10</span>;
    return <span style={{ color: "var(--n5)" }}>live</span>;
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "transparent", border: "none", cursor: "pointer", padding: 0,
        }}
      >
        <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 13, color: "var(--gold)", letterSpacing: 0.3 }}>
          🎯 Goalscorer wager
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {myWagers.length > 0 && (
            <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, color: "var(--n5)" }}>
              {myWagers.length} pick{myWagers.length > 1 ? "s" : ""}
            </span>
          )}
          <span style={{ color: "var(--n5)", fontSize: 13 }}>{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n5)", margin: 0, lineHeight: 1.5 }}>
            Optional. Stake <b style={{ color: "#fff" }}>−10</b>, and if your pick scores in 90/ET (not a shootout) you get <b style={{ color: "var(--g4)" }}>+15</b>. One goal or a hat-trick both pay +15.
          </p>

          {/* My current picks */}
          {myWagers.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {myWagers.map((w) => (
                <div key={w.player_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "7px 10px" }}>
                  <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13, color: "#fff" }}>
                    ⚽ {nameById.get(w.player_id) ?? "Player"}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-inter), sans-serif", fontSize: 11 }}>
                    {statusBadge(w.status)}
                    {!locked && w.status === "pending" && (
                      <button
                        onClick={() => handleCancel(w.player_id)}
                        disabled={busy}
                        style={{ background: "transparent", border: "none", color: "var(--r3)", cursor: busy ? "not-allowed" : "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}
                        aria-label="Cancel wager (refund)"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Picker (only before kickoff) */}
          {!locked ? (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={busy || !canAfford}
                  style={{
                    flex: 1, padding: "9px 10px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.15)",
                    background: "var(--n1)", color: "#fff", fontFamily: "var(--font-inter), sans-serif", fontSize: 13,
                  }}
                >
                  <option value="">Pick a player…</option>
                  {renderOptions(homeName, roster.home)}
                  {renderOptions(awayName, roster.away)}
                </select>
                <button
                  onClick={handlePlace}
                  disabled={selected === "" || busy || !canAfford}
                  style={{
                    padding: "9px 14px", borderRadius: 9, border: "none",
                    background: selected === "" || !canAfford ? "rgba(255,255,255,0.08)" : "var(--g3)",
                    color: selected === "" || !canAfford ? "var(--n5)" : "#fff",
                    fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13,
                    cursor: selected === "" || busy || !canAfford ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Back −10
                </button>
              </div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: canAfford ? "var(--n5)" : "var(--r3)" }}>
                {canAfford ? `Available: ${available} pts` : `Not enough points — need 10, have ${Math.max(0, available)}`}
              </div>
            </>
          ) : (
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n5)" }}>🔒 Locked at kickoff</div>
          )}

          {/* Reveal-at-lock: everyone's picks */}
          {locked && reveal.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 11, color: "var(--n4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                Everyone&apos;s picks
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {reveal.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "var(--font-inter), sans-serif", fontSize: 12 }}>
                    <span style={{ color: r.is_me ? "var(--g4)" : "var(--n3)", fontWeight: r.is_me ? 700 : 500 }}>
                      {r.member_name}{r.is_me ? " (you)" : ""}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--n4)" }}>
                      ⚽ {r.player_name} {statusBadge(r.status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {err && <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--r3)" }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
