import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--n8)" }}>
      <div>
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: "var(--n0)", margin: 0 }}>{label}</p>
        {sub && <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", margin: "2px 0 0" }}>{sub}</p>}
      </div>
      <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 15, color: "var(--g2)", marginLeft: 12, flexShrink: 0 }}>{value}</span>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  backgroundColor: "var(--surf)",
  borderRadius: 16,
  boxShadow: "var(--sh-sm)",
  overflow: "hidden",
};

const summaryStyle: React.CSSProperties = {
  padding: "14px 16px",
  fontFamily: "var(--font-saira), sans-serif",
  fontWeight: 800,
  fontSize: 13,
  color: "var(--n0)",
  textTransform: "uppercase",
  letterSpacing: 1,
  cursor: "pointer",
  listStyle: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  userSelect: "none",
};

const bodyStyle: React.CSSProperties = {
  padding: "0 16px 16px",
  borderTop: "1px solid var(--n8)",
};

const note: React.CSSProperties = {
  fontFamily: "var(--font-inter), sans-serif",
  fontSize: 12,
  color: "var(--n5)",
  margin: "8px 0 0",
  lineHeight: 1.5,
};

export default async function RulesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/join");

  return (
    <div style={{ padding: "16px 14px 32px", display: "flex", flexDirection: "column", gap: 10, maxWidth: 480, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Link href="/predict" style={{ color: "var(--n5)", textDecoration: "none", fontSize: 20, lineHeight: 1 }}>←</Link>
        <h1 style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 26, color: "var(--n0)", margin: 0, letterSpacing: 0.5 }}>
          How it works
        </h1>
      </div>

      {/* Predictions — open by default */}
      <details open style={sectionStyle}>
        <summary style={summaryStyle}>⚽ Predictions <span style={{ color: "var(--n6)", fontSize: 16 }}>›</span></summary>
        <div style={bodyStyle}>
          <Row label="Correct result" value="+1 pt" sub="Right winner or draw, wrong score" />
          <Row label="Exact score" value="+3 pts" sub="Right scoreline" />
          <p style={note}>Locks at kickoff. Admin can open a short late window — look for the ⚡ chip.</p>
        </div>
      </details>

      {/* Live in-play */}
      <details style={sectionStyle}>
        <summary style={summaryStyle}>⏱️ Live in-play <span style={{ color: "var(--n6)", fontSize: 16 }}>›</span></summary>
        <div style={bodyStyle}>
          <p style={{ ...note, margin: "8px 0 4px" }}>Knockout matches only. Exact score only — close doesn&apos;t count.</p>
          <Row label="Half-time score" value="+2 pts" sub="Locks at kickoff" />
          <Row label="90′ score" value="+2 pts" sub="Locks at half-time" />
          <Row label="Extra-time score" value="+2 pts" sub="Only if level at 90′" />
          <Row label="Penalty tally" value="+2 pts" sub="Only if level at ET" />
          <p style={note}>HT + FT shown before kickoff. ET/pens appear only if reached. Picks hidden from others until window closes.</p>
        </div>
      </details>

      {/* Nation picks */}
      <details style={sectionStyle}>
        <summary style={summaryStyle}>🏳️ Nation picks <span style={{ color: "var(--n6)", fontSize: 16 }}>›</span></summary>
        <div style={bodyStyle}>
          <Row label="Primary wins" value="+3 pts" />
          <Row label="Primary draws" value="+1 pt" />
          <Row label="Wildcard wins" value="+6 pts" sub="2× · must be outside FIFA top 15" />
          <Row label="Wildcard draws" value="+2 pts" />
          <p style={note}>Wildcard = first come first serve per league.</p>
          <p style={{ ...note, marginTop: 12, fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--n5)" }}>Progression bonuses</p>
          <Row label="Reach RO32" value="+3 pts" />
          <Row label="Reach R16" value="+10 pts" />
          <Row label="Reach QF" value="+20 pts" />
          <Row label="Reach SF" value="+30 pts" />
          <Row label="Bronze Final" value="+35 pts" />
          <Row label="Runner-up" value="+40 pts" />
          <Row label="Win 🏆" value="+50 pts" />
        </div>
      </details>

      {/* Knockout re-draft */}
      <details style={sectionStyle}>
        <summary style={summaryStyle}>🔁 Knockout re-draft <span style={{ color: "var(--n6)", fontSize: 16 }}>›</span></summary>
        <div style={bodyStyle}>
          <p style={{ ...note, margin: "8px 0 4px" }}>Board reopens each knockout round. Keep your team free, or swap for a cost.</p>
          <Row label="RO32 — primary swap" value="−3 pts" sub="Pick from top 12 ranked survivors" />
          <Row label="RO32 — secondary swap" value="Free" sub="Pick from other 20" />
          <Row label="R16 swap" value="−5 pts" />
          <Row label="QF swap" value="−8 pts" />
          <Row label="SF swap" value="−10 pts" />
          <Row label="Final swap" value="−12 pts" />
          <p style={note}>Secondary team runs through RO32 only. If it reaches R16 you get +20 farewell bonus, then it dissolves.</p>
        </div>
      </details>

      {/* Bracket */}
      <details style={sectionStyle}>
        <summary style={summaryStyle}>🏆 Bracket contest <span style={{ color: "var(--n6)", fontSize: 16 }}>›</span></summary>
        <div style={bodyStyle}>
          <p style={{ ...note, margin: "8px 0 4px" }}>Separate side contest. Pick who advances in every tie each round.</p>
          <Row label="Each correct call" value="+1 pt" />
          <p style={note}>Locks 30 min before first match of the round. Standings separate from main leaderboard.</p>
        </div>
      </details>

      {/* FAQ */}
      <details style={sectionStyle}>
        <summary style={summaryStyle}>❓ FAQ <span style={{ color: "var(--n6)", fontSize: 16 }}>›</span></summary>
        <div style={bodyStyle}>
          {[
            {
              q: "What are the HT / FT inputs on the predict card?",
              a: "Live checkpoint picks. Set your half-time and full-time score guesses before kickoff. Each exact hit = +2 pts, scored separately from your main prediction.",
            },
            {
              q: "Does the bracket count toward my main score?",
              a: "No. Separate standings, separate contest.",
            },
            {
              q: "I already picked nations. Why can I pick again?",
              a: "RO32 re-draft — optional swap to any surviving team. Your old picks carry over automatically.",
            },
            {
              q: "Only 4 matches on predict. Where are the others?",
              a: "Batched. Next 4 appear once these are played or locked.",
            },
          ].map(({ q, a }, i, arr) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--n8)" : "none" }}>
              <p style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13, color: "var(--n0)", margin: "0 0 4px" }}>{q}</p>
              <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n5)", margin: 0, lineHeight: 1.5 }}>{a}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
