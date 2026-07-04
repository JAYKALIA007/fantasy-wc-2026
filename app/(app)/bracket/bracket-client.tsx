"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FLAG_EMOJI } from "@/lib/utils/flags";
import { toISTWithDay } from "@/lib/utils/date";

type NationRef = { id: number; name: string };
type Match = { id: number; kickoff_time: string; home: NationRef; away: NationRef };
type Standing = { user_id: string; correct: number; picked: number; name: string; isMe: boolean };

type Props = {
  leagueId: string;
  roundLabel: string;
  matches: Match[];
  myPicks: Record<number, number>;
  locked: boolean;
  lockAt: string | null;
  standings: Standing[];
  resolvedCount: number;
  advancers: Record<number, number>;
};

export default function BracketClient({ roundLabel, matches, myPicks, locked, lockAt, standings, resolvedCount, advancers }: Props) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<number, number>>(myPicks);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const pickedCount = Object.keys(picks).length;

  async function submit() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    const res = await fetch("/api/bracket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks: Object.entries(picks).map(([match_id, advancer_nation_id]) => ({ match_id: Number(match_id), advancer_nation_id })) }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setError(d.error ?? "Something went wrong");
      setSaving(false);
      return;
    }
    setSavedMsg("Bracket saved ✓");
    setSaving(false);
    router.refresh();
  }

  const standingsBlock = standings.length > 0 && (
    <div style={{ background: "var(--surf)", borderRadius: 14, padding: "16px", boxShadow: "var(--sh-sm)", marginTop: locked ? 4 : 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 13, color: "var(--n0)", textTransform: "uppercase", letterSpacing: 0.8 }}>Bracket standings</span>
        <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n5)" }}>{resolvedCount}/{matches.length} ties decided</span>
      </div>
      {standings.map((s, i) => (
        <div key={s.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--n8)" }}>
          <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: s.isMe ? "var(--g2)" : "var(--n0)", fontWeight: s.isMe ? 700 : 400 }}>
            {i + 1}. {s.name}{s.isMe ? " (you)" : ""}
          </span>
          <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 14, color: "var(--n0)" }}>{s.correct} correct</span>
        </div>
      ))}
    </div>
  );

  const picksBlock = (
    <>
      {locked && (
        <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 13, color: "var(--n0)", textTransform: "uppercase", letterSpacing: 0.8, margin: "20px 2px 10px" }}>
          Your picks
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {matches.map((m, i) => {
          const sel = picks[m.id];
          const advancer = advancers[m.id];
          const resolved = advancer !== undefined;
          return (
            <div key={m.id} style={{ background: "var(--surf)", borderRadius: 12, padding: "8px", boxShadow: "var(--sh-sm)" }}>
              <div style={{ fontFamily: "var(--font-saira), sans-serif", fontSize: 9.5, color: "var(--n6)", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 2px 6px" }}>
                Tie {i + 1}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[m.home, m.away].map((team) => {
                  const isSel = sel === team.id;
                  const isAdvancer = resolved && advancer === team.id;
                  const isWrongPick = resolved && isSel && advancer !== team.id;
                  const border = isAdvancer ? "var(--g3)" : isWrongPick ? "var(--r2)" : isSel ? "var(--n0)" : "var(--n8)";
                  const bg = isAdvancer ? "var(--gbg)" : isWrongPick ? "#fdf2f2" : isSel ? "var(--n9)" : "var(--surf)";
                  return (
                    <button
                      key={team.id}
                      onClick={() => !locked && setPicks((p) => ({ ...p, [m.id]: team.id }))}
                      disabled={locked}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "10px 10px", borderRadius: 9,
                        border: `1.5px solid ${border}`, background: bg, cursor: locked ? "default" : "pointer",
                        textAlign: "left", width: "100%",
                      }}
                    >
                      <span style={{ fontSize: 22, lineHeight: 1 }}>{FLAG_EMOJI[team.name] ?? "🏳"}</span>
                      <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 12.5, color: "var(--n0)", lineHeight: 1.1 }}>{team.name}</span>
                      {isAdvancer && <span style={{ marginLeft: "auto", color: "var(--g2)", fontSize: 13 }}>✓</span>}
                      {isWrongPick && <span style={{ marginLeft: "auto", color: "var(--r2)", fontSize: 13 }}>✗</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 14px 90px", minHeight: "100%", background: "var(--bg)" }}>
      <h1 style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 30, color: "var(--n0)", margin: "0 0 4px" }}>{roundLabel} Bracket</h1>
      <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n5)", margin: "0 0 6px", lineHeight: 1.5 }}>
        Pick who advances in each of the {matches.length} ties. {locked ? "Bracket is locked." : "Lock"}{!locked && lockAt ? ` at ${toISTWithDay(lockAt)}.` : ""}
      </p>
      {!locked && (
        <p style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 12, color: pickedCount === matches.length ? "var(--g2)" : "var(--n5)", margin: "0 0 14px" }}>
          {pickedCount} / {matches.length} picked
        </p>
      )}

      {/* Once locked, standings lead and the user's picks sit below them. */}
      {locked ? (
        <>
          {standingsBlock}
          {picksBlock}
        </>
      ) : (
        <>
          {picksBlock}
          {error && <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--r2)", marginTop: 12 }}>{error}</p>}
          {savedMsg && <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--g2)", marginTop: 12 }}>{savedMsg}</p>}
          {standingsBlock}
          <div style={{ position: "sticky", bottom: 0, paddingTop: 12, marginTop: 8 }}>
            <button
              onClick={submit}
              disabled={saving || pickedCount === 0}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                background: pickedCount === 0 ? "var(--n8)" : "var(--g3)", color: pickedCount === 0 ? "var(--n5)" : "#fff",
                fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 16, cursor: saving || pickedCount === 0 ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : pickedCount < matches.length ? `Save bracket (${pickedCount}/${matches.length})` : "Save bracket ✓"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
