"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FLAG_EMOJI } from "@/lib/utils/flags";
import { toISTWithDay } from "@/lib/utils/date";

type Nation = { id: number; name: string; fifa_ranking: number | null };

const PRIMARY_SWAP_COST = 3;
const R16_SWAP_COST = 5;

type Props = {
  round: "ro32" | "r16";
  leagueId: string;
  windowOpen: boolean;
  closesAt: string | null;
  primaryPool: Nation[];
  secondaryPool: Nation[];
  originalPrimary: number | null;
  currentPrimary: number | null;
  presetSecondary: number | null;
  secondaryInvalidated: boolean;
};

export default function RedraftClient({
  round,
  leagueId,
  windowOpen,
  closesAt,
  primaryPool,
  secondaryPool,
  originalPrimary,
  currentPrimary,
  presetSecondary,
  secondaryInvalidated,
}: Props) {
  const router = useRouter();
  const isR16 = round === "r16";
  const roundLabel = isR16 ? "Round of 16" : "Round of 32";
  const swapCost = isR16 ? R16_SWAP_COST : PRIMARY_SWAP_COST;
  const maxStep = isR16 ? 2 : 3;

  const [step, setStep] = useState(1);
  const [primaryId, setPrimaryId] = useState<number | null>(currentPrimary);
  const [secondaryId, setSecondaryId] = useState<number | null>(presetSecondary);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primarySwapped = primaryId !== null && primaryId !== originalPrimary;
  const totalCost = primarySwapped ? swapCost : 0;

  const nameOf = (id: number | null, pool: Nation[]) => pool.find((n) => n.id === id)?.name ?? "—";

  async function submit() {
    if (primaryId == null) return;
    if (!isR16 && secondaryId == null) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/redraft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        league_id: leagueId,
        round,
        primary_nation_id: primaryId,
        secondary_nation_id: isR16 ? null : secondaryId,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Something went wrong");
      setSaving(false);
      return;
    }
    router.push("/nation");
    router.refresh();
  }

  if (!windowOpen) {
    return (
      <div style={wrap}>
        <div style={{ ...card, textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <h1 style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 24, color: "var(--n0)", margin: 0 }}>Re-draft closed</h1>
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: "var(--n5)", marginTop: 8, lineHeight: 1.5 }}>
            The {roundLabel} re-draft window isn&apos;t open right now. Your current team stays as it is.
          </p>
        </div>
      </div>
    );
  }

  const closeLabel = closesAt ? toISTWithDay(closesAt) : null;
  const nextDisabled = step === 1 ? primaryId == null : !isR16 && secondaryId == null;

  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={labelCaps}>Re-draft · {roundLabel}</span>
        {closeLabel && <span style={{ ...labelCaps, color: "var(--g2)" }}>Closes {closeLabel}</span>}
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 18 }}>
        {Array.from({ length: maxStep }, (_, i) => i + 1).map((s) => (
          <div key={s} style={{ flex: s === step ? 2 : 1, height: 6, borderRadius: 4, backgroundColor: s < step ? "var(--g3)" : s === step ? "var(--n0)" : "var(--n8)", transition: "all 0.3s ease" }} />
        ))}
      </div>

      {step === 1 && (
        <Picker
          title={isR16 ? "Your team" : "Your primary"}
          subtitle={
            isR16 ? (
              <>Pick any surviving team. Keeping is free — switching to a team you didn&apos;t hold costs <strong style={{ color: "var(--r2)" }}>−{swapCost} pts</strong>.</>
            ) : (
              <>Pick from the 12 highest-ranked survivors. Keeping is free — any swap costs <strong style={{ color: "var(--r2)" }}>−{swapCost} pts</strong>.</>
            )
          }
          pool={primaryPool}
          selectedId={primaryId}
          keepId={originalPrimary}
          swapCost={swapCost}
          onSelect={setPrimaryId}
        />
      )}

      {step === 2 && !isR16 && (
        <>
          {secondaryInvalidated && (
            <div style={{ background: "var(--gbg)", border: "1px solid var(--g3)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--g2)", margin: 0, lineHeight: 1.5 }}>
                Your old wildcard moved into the primary pool — pick a new one below. It&apos;s free.
              </p>
            </div>
          )}
          <Picker
            title="Your wildcard"
            subtitle={<>Pick a dark horse from the other 20 survivors. Switching is <strong style={{ color: "var(--g2)" }}>free</strong> at the re-draft.</>}
            pool={secondaryPool}
            selectedId={secondaryId}
            keepId={presetSecondary}
            swapCost={0}
            onSelect={setSecondaryId}
          />
        </>
      )}

      {step === maxStep && (
        <div style={{ ...card, padding: "18px 16px" }}>
          <h1 style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 26, color: "var(--n0)", margin: "0 0 16px" }}>Confirm re-draft</h1>
          <SummaryRow label={isR16 ? "Team" : "Primary"} from={nameOf(originalPrimary, primaryPool)} to={nameOf(primaryId, primaryPool)} cost={primarySwapped ? swapCost : 0} />
          {!isR16 && <SummaryRow label="Wildcard" from={nameOf(presetSecondary, secondaryPool)} to={nameOf(secondaryId, secondaryPool)} cost={0} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--n8)", marginTop: 12, paddingTop: 14 }}>
            <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 14, color: "var(--n0)", textTransform: "uppercase", letterSpacing: 0.8 }}>Total cost</span>
            <span style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 22, color: totalCost > 0 ? "var(--r2)" : "var(--g2)" }}>{totalCost > 0 ? `−${totalCost} pts` : "Free"}</span>
          </div>
          {error && <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--r2)", marginTop: 12 }}>{error}</p>}
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", margin: "12px 0 0", lineHeight: 1.5 }}>
            ↻ You can come back and change until the window closes{closeLabel ? ` (${closeLabel})` : ""}. Only your final pick counts — swapping back to a team you already had costs nothing.
          </p>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 18 }}>
        <div>
          <div style={{ ...labelCaps, marginBottom: 2 }}>Cost so far</div>
          <div style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 20, color: totalCost > 0 ? "var(--r2)" : "var(--g2)" }}>{totalCost > 0 ? `−${totalCost} pts` : "0 pts"}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {step > 1 && (
            <button onClick={() => setStep((s) => s - 1)} style={btnGhost}>Back</button>
          )}
          {step < maxStep && (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={nextDisabled}
              style={{ ...btnPrimary, opacity: nextDisabled ? 0.5 : 1 }}
            >
              {isR16 ? "Review →" : step === 1 ? "Next: wildcard →" : "Review →"}
            </button>
          )}
          {step === maxStep && (
            <button onClick={submit} disabled={saving || primaryId == null || (!isR16 && secondaryId == null)} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : totalCost > 0 ? `Confirm · −${totalCost}` : isR16 ? "Lock my team" : "Lock my teams"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Picker({ title, subtitle, pool, selectedId, keepId, swapCost, onSelect }: {
  title: string;
  subtitle: React.ReactNode;
  pool: Nation[];
  selectedId: number | null;
  keepId: number | null;
  swapCost: number;
  onSelect: (id: number) => void;
}) {
  return (
    <div>
      <h1 style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 26, color: "var(--n0)", margin: "0 0 4px" }}>{title}</h1>
      <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n5)", margin: "0 0 14px", lineHeight: 1.5 }}>{subtitle}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {pool.map((n) => {
          const flag = FLAG_EMOJI[n.name] ?? "🏳";
          const isSel = selectedId === n.id;
          const isKeep = n.id === keepId;
          const badge = isSel ? (isKeep || swapCost === 0 ? { text: isKeep ? "KEEP · FREE" : "SWITCH · FREE", bg: "var(--gbg)", fg: "var(--g2)" } : { text: `SWAP · −${swapCost}`, bg: "#fdecec", fg: "var(--r2)" }) : null;
          return (
            <button
              key={n.id}
              onClick={() => onSelect(n.id)}
              style={{
                position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                padding: "14px 10px 12px", borderRadius: 12, cursor: "pointer", transition: "all 0.15s",
                border: isSel ? `2px solid ${isKeep || swapCost === 0 ? "var(--g3)" : "var(--r2)"}` : "2px solid var(--n8)",
                backgroundColor: isSel ? (isKeep || swapCost === 0 ? "var(--gbg)" : "#fdf2f2") : "var(--surf)",
              }}
            >
              {badge && (
                <span style={{ position: "absolute", top: 6, right: 6, background: badge.bg, color: badge.fg, fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 8.5, letterSpacing: 0.4, padding: "2px 5px", borderRadius: 5 }}>
                  {badge.text}
                </span>
              )}
              <span style={{ fontSize: 30, lineHeight: 1 }}>{flag}</span>
              <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 12.5, color: "var(--n0)", textAlign: "center", lineHeight: 1.2 }}>{n.name}</span>
              <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 10, color: "var(--n5)" }}>{n.fifa_ranking ? `FIFA #${n.fifa_ranking}` : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({ label, from, to, cost }: { label: string; from: string; to: string; cost: number }) {
  const changed = from !== to;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--n8)" }}>
      <div>
        <div style={{ ...labelCaps, marginBottom: 3 }}>{label}</div>
        <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: "var(--n0)" }}>
          {changed ? <>{from} → <strong>{to}</strong></> : <>{to} · kept</>}
        </div>
      </div>
      <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 13, color: cost > 0 ? "var(--r2)" : "var(--g2)", flexShrink: 0 }}>
        {cost > 0 ? `−${cost}` : "free"}
      </span>
    </div>
  );
}

const wrap: React.CSSProperties = { maxWidth: 480, margin: "0 auto", padding: "16px 14px 28px", minHeight: "100%", backgroundColor: "var(--bg)" };
const card: React.CSSProperties = { backgroundColor: "var(--surf)", borderRadius: 16, boxShadow: "var(--sh-sm)" };
const labelCaps: React.CSSProperties = { fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "var(--n5)" };
const btnPrimary: React.CSSProperties = { border: "none", background: "var(--g3)", color: "#fff", fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 15, padding: "12px 18px", borderRadius: 10, cursor: "pointer" };
const btnGhost: React.CSSProperties = { border: "1.5px solid var(--n8)", background: "var(--surf)", color: "var(--n5)", fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 15, padding: "12px 16px", borderRadius: 10, cursor: "pointer" };
