"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Nation = { id: number; name: string; fifa_ranking: number | null };

type League = { id: string; name: string; max_players: number };

type Props = {
  userEmail: string;
  userId: string;
  league: League;
  nations: Nation[];
  memberCount: number;
};

const FLAG_EMOJI: Record<string, string> = {
  "Argentina": "🇦🇷", "France": "🇫🇷", "Spain": "🇪🇸", "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Brazil": "🇧🇷", "Portugal": "🇵🇹", "Netherlands": "🇳🇱", "Belgium": "🇧🇪",
  "Colombia": "🇨🇴", "Uruguay": "🇺🇾", "Croatia": "🇭🇷", "Germany": "🇩🇪",
  "Morocco": "🇲🇦", "United States": "🇺🇸", "Japan": "🇯🇵", "Mexico": "🇲🇽",
  "Switzerland": "🇨🇭", "Senegal": "🇸🇳", "Iran": "🇮🇷", "South Korea": "🇰🇷",
  "Egypt": "🇪🇬", "Australia": "🇦🇺", "Austria": "🇦🇹", "Ecuador": "🇪🇨",
  "Türkiye": "🇹🇷", "Norway": "🇳🇴", "Sweden": "🇸🇪", "Tunisia": "🇹🇳",
  "Algeria": "🇩🇿", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Ivory Coast": "🇨🇮", "Paraguay": "🇵🇾",
  "Saudi Arabia": "🇸🇦", "Czechia": "🇨🇿", "Ghana": "🇬🇭", "South Africa": "🇿🇦",
  "Qatar": "🇶🇦", "Congo DR": "🇨🇩", "Panama": "🇵🇦", "Bosnia-Herzegovina": "🇧🇦",
  "Canada": "🇨🇦", "Uzbekistan": "🇺🇿", "Cape Verde": "🇨🇻", "Iraq": "🇮🇶",
  "Jordan": "🇯🇴", "New Zealand": "🇳🇿", "Haiti": "🇭🇹", "Curaçao": "🇨🇼",
};

const TOTAL_STEPS = 6;
const STEP_LABELS = ["Invite", "Sign in", "How it works", "Primary pick", "Wildcard pick", "Your name"];

export default function OnboardingClient({ userEmail, userId, league, nations, memberCount }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [primaryNationId, setPrimaryNationId] = useState<number | null>(null);
  const [secondaryNationId, setSecondaryNationId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const top15 = nations.filter(n => (n.fifa_ranking ?? 99) <= 15);
  const rest = nations.filter(n => (n.fifa_ranking ?? 99) > 15);

  useEffect(() => {
    if (step === 1) { const t = setTimeout(() => setStep(2), 1000); return () => clearTimeout(t); }
  }, [step]);
  useEffect(() => {
    if (step === 2) { const t = setTimeout(() => setStep(3), 1000); return () => clearTimeout(t); }
  }, [step]);

  const handleSave = useCallback(async () => {
    if (!profileName.trim()) return;
    if (!league.id) {
      setError("League not found — please contact the admin.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    await supabase.from("profiles").upsert({ id: userId });
    const { error: insertError } = await supabase.from("league_members").insert({
      league_id: league.id,
      user_id: userId,
      profile_name: profileName.trim(),
      primary_nation_id: primaryNationId,
      secondary_nation_id: secondaryNationId,
    });
    if (insertError) { setError(insertError.message); setSaving(false); return; }
    router.push("/");
  }, [profileName, league.id, userId, primaryNationId, secondaryNationId, router]);

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", backgroundColor: "var(--bg)", maxWidth: 430, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ backgroundColor: "var(--surf)", flexShrink: 0, padding: "16px 16px 14px", borderBottom: "1px solid rgba(14,23,38,.07)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, color: "var(--n5)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
            Step {step} of {TOTAL_STEPS}
          </span>
          <span style={{ fontSize: 11, fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, color: "var(--g3)", letterSpacing: "1px", textTransform: "uppercase" }}>
            {STEP_LABELS[step - 1]}
          </span>
        </div>
        <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
            <div key={s} style={{ flex: s === step ? 2 : 1, height: 7, borderRadius: 4, backgroundColor: s < step ? "var(--g3)" : s === step ? "var(--n0)" : "var(--n8)", transition: "all 0.3s ease" }} />
          ))}
        </div>
        <div style={{ height: 4, borderRadius: 2, backgroundColor: "var(--n8)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, backgroundColor: "var(--g3)", borderRadius: 2, transition: "width 0.4s ease" }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 0" }}>
        {step === 1 && <StepConfirm icon="🏆" title="Invite verified ✓" />}
        {step === 2 && <StepConfirm icon="✅" title="Signed in" subtitle={userEmail} />}
        {step === 3 && <StepHowItWorks />}
        {step === 4 && (
          <StepNationPicker
            title="Your #1 pick"
            subtitle="Pick the team you think will win the tournament. Top 15 by FIFA ranking only."
            nations={top15}
            selectedId={primaryNationId}
            onSelect={setPrimaryNationId}
          />
        )}
        {step === 5 && (
          <StepNationPicker
            title="Your wildcard"
            subtitle="Pick a dark horse — a team outside the top 15. Bonus points if they surprise everyone."
            nations={rest}
            selectedId={secondaryNationId}
            onSelect={setSecondaryNationId}
          />
        )}
        {step === 6 && (
          <StepProfile profileName={profileName} onChange={setProfileName} error={error} />
        )}
      </div>

      {/* Bottom tray */}
      {step >= 3 && (
        <div style={{ flexShrink: 0, backgroundColor: "var(--surf)", borderTop: "1px solid rgba(14,23,38,.07)", padding: "12px 14px 14px" }}>
          {step < 6 && (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 4 ? !primaryNationId : step === 5 ? !secondaryNationId : false}
              style={{
                display: "block", width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                cursor: (step === 4 ? !primaryNationId : step === 5 ? !secondaryNationId : false) ? "not-allowed" : "pointer",
                backgroundColor: (step === 4 ? !primaryNationId : step === 5 ? !secondaryNationId : false) ? "var(--n8)" : "var(--g3)",
                color: (step === 4 ? !primaryNationId : step === 5 ? !secondaryNationId : false) ? "var(--n5)" : "#fff",
                fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 16, transition: "background-color 0.2s",
              }}
            >
              {step === 3 ? "Got it →" : "Continue →"}
            </button>
          )}
          {step === 6 && (
            <button
              onClick={handleSave}
              disabled={!profileName.trim() || saving}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                cursor: profileName.trim() && !saving ? "pointer" : "not-allowed",
                backgroundColor: profileName.trim() && !saving ? "var(--g3)" : "var(--n8)",
                color: profileName.trim() && !saving ? "#fff" : "var(--n5)",
                fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 16, transition: "background-color 0.2s",
              }}
            >
              {saving && <span className="btn-spinner" />}
              {saving ? "Joining…" : "Join the league →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StepConfirm({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 16 }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "var(--gbg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 28 }}>{icon}</span>
      </div>
      <p style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 20, color: "var(--n0)", textAlign: "center", margin: 0 }}>{title}</p>
      {subtitle && <p style={{ fontSize: 14, color: "var(--n4)", fontFamily: "var(--font-inter), sans-serif", margin: 0 }}>{subtitle}</p>}
    </div>
  );
}

function StepHowItWorks() {
  const rows = [
    { label: "Correct result", value: "+1 pt", sub: "Right winner or draw" },
    { label: "Exact score", value: "+3 pts", sub: "Exact home & away goals" },
    { label: "Nation wins a match", value: "+3 pts", sub: "Both primary & wildcard" },
    { label: "Nation draws", value: "+1 pt", sub: "Group stage draws count" },
    { label: "Nation reaches R16", value: "+10 pts", sub: "R32 +5, QF +15, SF +20" },
    { label: "Nation wins the final 🏆", value: "+50 pts", sub: "" },
  ];
  return (
    <div style={{ paddingBottom: 16 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 28, color: "var(--n0)", margin: 0 }}>How it works</h1>
        <p style={{ fontSize: 13, color: "var(--n5)", marginTop: 5, fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.5 }}>
          Your score = prediction points + nation bonus points. Here&apos;s how each is earned.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid var(--n8)" }}>
            <div>
              <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: "var(--n0)", margin: 0 }}>{r.label}</p>
              {r.sub && <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", margin: "2px 0 0" }}>{r.sub}</p>}
            </div>
            <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 15, color: "var(--g2)", flexShrink: 0, marginLeft: 12 }}>{r.value}</span>
          </div>
        ))}
      </div>
      <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", marginTop: 16, lineHeight: 1.5 }}>
        ⏱ Predictions lock at exact kickoff. You&apos;ll pick your two nations in the next steps.
      </p>
    </div>
  );
}

function StepNationPicker({ title, subtitle, nations, selectedId, onSelect }: {
  title: string;
  subtitle: string;
  nations: Nation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div style={{ paddingBottom: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 28, color: "var(--n0)", margin: 0 }}>{title}</h1>
        <p style={{ fontSize: 13, color: "var(--n5)", marginTop: 5, fontFamily: "var(--font-inter), sans-serif", lineHeight: 1.5 }}>{subtitle}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {nations.map(nation => {
          const flag = FLAG_EMOJI[nation.name] ?? "🏳";
          const isSelected = selectedId === nation.id;
          return (
            <button
              key={nation.id}
              onClick={() => onSelect(nation.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 4, padding: "12px 6px", borderRadius: 12,
                border: isSelected ? "2px solid var(--g3)" : "2px solid var(--n8)",
                backgroundColor: isSelected ? "var(--gbg)" : "var(--surf)",
                cursor: "pointer", transition: "all 0.15s",
                boxShadow: isSelected ? "0 0 0 3px rgba(0,184,92,0.15)" : "none",
              }}
            >
              <span style={{ fontSize: 28, lineHeight: 1 }}>{flag}</span>
              <span style={{ fontSize: 10, fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, color: isSelected ? "var(--g2)" : "var(--n4)", textAlign: "center", lineHeight: 1.2 }}>
                {nation.name}
              </span>
              {nation.fifa_ranking && (
                <span style={{ fontSize: 9, color: isSelected ? "var(--g3)" : "var(--n6)", fontFamily: "var(--font-inter), sans-serif" }}>
                  #{nation.fifa_ranking}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepProfile({ profileName, onChange, error }: { profileName: string; onChange: (v: string) => void; error: string | null }) {
  return (
    <div style={{ paddingBottom: 16 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 28, color: "var(--n0)", margin: 0 }}>Set your name</h1>
        <p style={{ fontSize: 13, color: "var(--n5)", marginTop: 5, fontFamily: "var(--font-inter), sans-serif" }}>This is how you&apos;ll appear on the leaderboard.</p>
      </div>
      <input
        type="text"
        value={profileName}
        onChange={e => onChange(e.target.value)}
        placeholder="Your display name"
        maxLength={40}
        style={{
          display: "block", width: "100%", padding: "14px 16px", borderRadius: 12,
          border: "2px solid var(--n8)", backgroundColor: "var(--surf)", fontSize: 16,
          fontFamily: "var(--font-inter), sans-serif", color: "var(--n0)", outline: "none",
          boxSizing: "border-box", transition: "border-color 0.15s",
        }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--g3)"; }}
        onBlur={e => { e.currentTarget.style.borderColor = "var(--n8)"; }}
      />
      {error && <p style={{ fontSize: 13, color: "var(--r2)", marginTop: 12, fontFamily: "var(--font-inter), sans-serif" }}>{error}</p>}
    </div>
  );
}
