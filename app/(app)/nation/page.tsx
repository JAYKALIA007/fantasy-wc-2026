import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { FLAG_EMOJI } from "@/lib/utils/flags";

export default async function NationPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/join");

  // Fetch member's nation picks
  const { data: membership } = await supabase
    .from("league_members")
    .select("id, primary_nation_id, secondary_nation_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Fetch nation names
  const nationIds = [
    membership?.primary_nation_id,
    membership?.secondary_nation_id,
  ].filter((id): id is number => id !== null);

  const nationMap = new Map<number, { name: string; fifa_ranking: number | null }>();
  if (nationIds.length > 0) {
    const { data: nations } = await supabase
      .from("nations")
      .select("id, name, fifa_ranking")
      .in("id", nationIds);
    for (const n of nations ?? []) {
      nationMap.set(n.id as number, { name: n.name as string, fifa_ranking: n.fifa_ranking as number | null });
    }
  }

  // Fetch total nation bonus points earned
  let totalBonusPoints = 0;
  if (membership?.id) {
    const { data: bonuses } = await supabase
      .from("nation_bonus_points")
      .select("points")
      .eq("league_member_id", membership.id);
    totalBonusPoints = (bonuses ?? []).reduce((sum, b) => sum + (b.points as number), 0);
  }

  const primaryNation = membership?.primary_nation_id ? nationMap.get(membership.primary_nation_id) : null;
  const secondaryNation = membership?.secondary_nation_id ? nationMap.get(membership.secondary_nation_id) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
        backgroundColor: "var(--bg)",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "var(--n0)",
          padding: "28px 20px 24px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-anton), sans-serif",
            fontSize: 36,
            color: "#fff",
            margin: 0,
            letterSpacing: 1,
            lineHeight: 1.1,
          }}
        >
          PICK YOUR NATION
        </h1>
        <p
          style={{
            fontFamily: "var(--font-saira), sans-serif",
            fontWeight: 700,
            fontSize: 13,
            color: "var(--g3)",
            textTransform: "uppercase",
            letterSpacing: 2,
            marginTop: 8,
            marginBottom: 0,
          }}
        >
          Bonus points active
        </p>
      </div>

      <div
        style={{
          padding: "20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Your Picks card */}
        {(primaryNation || secondaryNation) && (
          <div
            style={{
              backgroundColor: "var(--surf)",
              borderRadius: 16,
              padding: "16px",
              boxShadow: "var(--sh-sm)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span
                style={{
                  fontFamily: "var(--font-saira), sans-serif",
                  fontWeight: 800,
                  fontSize: 13,
                  color: "var(--n0)",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                Your Picks
              </span>
              {totalBonusPoints > 0 && (
                <span
                  style={{
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "var(--g2)",
                    background: "var(--gbg)",
                    padding: "3px 10px",
                    borderRadius: 20,
                  }}
                >
                  +{totalBonusPoints} bonus pts earned
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              {primaryNation && (
                <NationCard
                  label="#1 Pick"
                  name={primaryNation.name}
                  ranking={primaryNation.fifa_ranking}
                />
              )}
              {secondaryNation && (
                <NationCard
                  label="Wildcard"
                  name={secondaryNation.name}
                  ranking={secondaryNation.fifa_ranking}
                />
              )}
            </div>
          </div>
        )}

        {/* Rules card */}
        <div
          style={{
            backgroundColor: "var(--n1)",
            borderRadius: 16,
            padding: "18px 16px",
            boxShadow: "var(--sh-md)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h2
              style={{
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 800,
                fontSize: 15,
                color: "var(--n9)",
                textTransform: "uppercase",
                letterSpacing: 0.8,
                margin: 0,
              }}
            >
              How Pick Your Nation Works
            </h2>
            <Link href="/rules" style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--g3)", textDecoration: "none", flexShrink: 0 }}>
              Full rules
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { num: 1, text: <>Choose one nation to support before the group stage ends</> },
              { num: 2, text: <>Primary nation wins: <strong style={{ color: "var(--g3)" }}>+3 pts</strong>. Wildcard wins: <strong style={{ color: "var(--g3)" }}>+6 pts</strong> (2× — first come first serve)</> },
              { num: 3, text: <>Draw: <strong style={{ color: "var(--g3)" }}>+1 pt</strong> primary, <strong style={{ color: "var(--g3)" }}>+2 pts</strong> wildcard</> },
              { num: 4, text: <>If your nation reaches the Round of 32: <strong style={{ color: "var(--g3)" }}>+5 points</strong></> },
              { num: 5, text: <>If your nation reaches the Round of 16: <strong style={{ color: "var(--g3)" }}>+10 points</strong></> },
              { num: 6, text: <>Quarter-finals: <strong style={{ color: "var(--g3)" }}>+20 points</strong></> },
              { num: 7, text: <>Semi-finals: <strong style={{ color: "var(--g3)" }}>+30 points</strong></> },
              { num: 8, text: <>Win Bronze Final: <strong style={{ color: "var(--g3)" }}>+35 points</strong></> },
              { num: 9, text: <>Reach the Final (runner-up): <strong style={{ color: "var(--g3)" }}>+40 points</strong></> },
              { num: 10, text: <><strong style={{ color: "var(--g3)" }}>Win the tournament: +50 points</strong></> },
            ].map((rule) => (
              <div key={rule.num} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div
                  style={{
                    width: 24, height: 24, borderRadius: "50%", backgroundColor: "var(--n2)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, color: "var(--n6)",
                  }}
                >
                  {rule.num}
                </div>
                <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n9)", margin: 0, lineHeight: 1.5, paddingTop: 3 }}>
                  {rule.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Why it's different */}
        <div
          style={{
            backgroundColor: "var(--n1)",
            borderRadius: 16,
            padding: "18px 16px",
            boxShadow: "var(--sh-sm)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 800,
              fontSize: 13,
              color: "var(--n9)",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              margin: "0 0 10px",
            }}
          >
            Why it&apos;s different
          </h2>
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n6)", margin: 0, lineHeight: 1.6 }}>
            Pick Your Nation rewards loyalty. Backing an underdog that goes on a run can
            massively change the leaderboard. Your prediction skill + your nation allegiance
            = your total score.
          </p>
        </div>
      </div>
    </div>
  );
}

function NationCard({ label, name, ranking }: { label: string; name: string; ranking: number | null }) {
  const flag = FLAG_EMOJI[name] ?? "🌐";
  return (
    <div
      style={{
        flex: 1,
        backgroundColor: "var(--surf2)",
        border: "2px solid var(--g3)",
        borderRadius: 14,
        padding: "14px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        boxShadow: "0 0 0 3px rgba(0,184,92,0.1)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-saira), sans-serif",
          fontWeight: 700,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: "var(--g2)",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 40, lineHeight: 1 }}>{flag}</span>
      <span
        style={{
          fontFamily: "var(--font-saira), sans-serif",
          fontWeight: 700,
          fontSize: 13,
          color: "var(--n0)",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {name}
      </span>
      {ranking && (
        <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 11, color: "var(--n5)" }}>
          FIFA #{ranking}
        </span>
      )}
    </div>
  );
}
