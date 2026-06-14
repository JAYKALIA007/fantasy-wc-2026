import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "var(--surf)", borderRadius: 16, padding: "18px 16px", boxShadow: "var(--sh-sm)" }}>
      <h2 style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 13, color: "var(--n0)", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 14px" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--n8)" }}>
      <div>
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: "var(--n0)", margin: 0 }}>{label}</p>
        {sub && <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", margin: "2px 0 0" }}>{sub}</p>}
      </div>
      <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 15, color: "var(--g2)" }}>{value}</span>
    </div>
  );
}

export default async function RulesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/join");

  return (
    <div style={{ padding: "16px 14px 32px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 480, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Link href="/predict" style={{ color: "var(--n5)", textDecoration: "none", fontSize: 20, lineHeight: 1 }}>←</Link>
        <h1 style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 26, color: "var(--n0)", margin: 0, letterSpacing: 0.5 }}>
          How it works
        </h1>
      </div>

      {/* Predictions */}
      <Section title="⚽  Predictions">
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n5)", margin: "0 0 10px", lineHeight: 1.5 }}>
          Predict the scoreline for every match before kickoff. Points are awarded based on accuracy.
        </p>
        <Row label="Correct result" value="+1 pt" sub="Right winner or draw, wrong scoreline" />
        <Row label="Exact score" value="+3 pts" sub="Right scoreline — home and away goals" />
        <div style={{ padding: "10px 0" }}>
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", margin: 0, lineHeight: 1.5 }}>
            ⏱ Predictions lock at exact kickoff time. No 30-minute buffer — plan ahead.
          </p>
        </div>
      </Section>

      {/* Nation picking */}
      <Section title="🏳️  Nation picks">
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n5)", margin: "0 0 10px", lineHeight: 1.5 }}>
          You picked two nations during sign-up. Every time they play, you earn bonus points on top of your prediction score.
        </p>
        <Row label="Primary nation wins" value="+3 pts" sub="Your #1 pick (top 15)" />
        <Row label="Wildcard nation wins" value="+6 pts" sub="2× — first come first serve pick" />
        <Row label="Primary draws" value="+1 pt" sub="Group stage draws count" />
        <Row label="Wildcard draws" value="+2 pts" sub="2× multiplier applies" />
        <div style={{ height: 8 }} />
        <p style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, color: "var(--n5)", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>Round progression bonuses</p>
        <Row label="Reach Round of 32" value="+5 pts" />
        <Row label="Reach Round of 16" value="+10 pts" />
        <Row label="Reach Quarter-finals" value="+15 pts" />
        <Row label="Reach Semi-finals" value="+20 pts" />
        <Row label="Win the tournament 🏆" value="+50 pts" />
        <div style={{ padding: "10px 0" }}>
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", margin: 0, lineHeight: 1.5 }}>
            💡 Backing an underdog that goes on a run can flip the entire leaderboard.
          </p>
        </div>
      </Section>

      {/* Leaderboard */}
      <Section title="🏅  Leaderboard">
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n5)", margin: 0, lineHeight: 1.6 }}>
          Your total score = <strong style={{ color: "var(--n0)" }}>prediction points</strong> + <strong style={{ color: "var(--n0)" }}>nation bonus points</strong>. Both tabs on the Ranks page show your combined total. The nation bonus column shows how much of it came from your picks.
        </p>
      </Section>
    </div>
  );
}
