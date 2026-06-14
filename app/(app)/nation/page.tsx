import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function NationPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/join");
  }

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
      {/* Top section */}
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
          }}
        >
          Coming Soon
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
        {/* Rules card */}
        <div
          style={{
            backgroundColor: "var(--n1)",
            borderRadius: 16,
            padding: "18px 16px",
            boxShadow: "var(--sh-md)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 800,
              fontSize: 15,
              color: "var(--n9)",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              margin: "0 0 14px",
            }}
          >
            How Pick Your Nation Works
          </h2>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {[
              {
                num: 1,
                text: (
                  <>
                    Choose one nation to support before the group stage ends
                  </>
                ),
              },
              {
                num: 2,
                text: (
                  <>
                    Every time your nation wins a match:{" "}
                    <strong style={{ color: "var(--g3)" }}>+3 bonus points</strong> added to
                    your prediction leaderboard total
                  </>
                ),
              },
              {
                num: 3,
                text: (
                  <>
                    Every draw your nation plays:{" "}
                    <strong style={{ color: "var(--g3)" }}>+1 bonus point</strong>
                  </>
                ),
              },
              {
                num: 4,
                text: (
                  <>
                    If your nation reaches the Round of 32:{" "}
                    <strong style={{ color: "var(--g3)" }}>+5 points</strong>
                  </>
                ),
              },
              {
                num: 5,
                text: (
                  <>
                    If your nation reaches the Round of 16:{" "}
                    <strong style={{ color: "var(--g3)" }}>+10 points</strong>
                  </>
                ),
              },
              {
                num: 6,
                text: (
                  <>
                    Quarter-finals:{" "}
                    <strong style={{ color: "var(--g3)" }}>+15 points</strong>
                  </>
                ),
              },
              {
                num: 7,
                text: (
                  <>
                    Semi-finals:{" "}
                    <strong style={{ color: "var(--g3)" }}>+20 points</strong>
                  </>
                ),
              },
              {
                num: 8,
                text: (
                  <>
                    <strong style={{ color: "var(--g3)" }}>Winners: +50 points</strong>
                  </>
                ),
              },
            ].map((rule) => (
              <div
                key={rule.num}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    backgroundColor: "var(--n2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontFamily: "var(--font-saira), sans-serif",
                    fontWeight: 700,
                    fontSize: 11,
                    color: "var(--n6)",
                  }}
                >
                  {rule.num}
                </div>
                <p
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 13,
                    color: "var(--n9)",
                    margin: 0,
                    lineHeight: 1.5,
                    paddingTop: 3,
                  }}
                >
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
          <p
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 13,
              color: "var(--n6)",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Unlike traditional fantasy leagues, Pick Your Nation rewards loyalty. Backing an
            underdog that goes on a run can massively change the leaderboard. Your prediction
            skill + your nation allegiance = your total score.
          </p>
        </div>

        {/* Fantasy league teaser */}
        <div
          style={{
            backgroundColor: "var(--n1)",
            borderRadius: 16,
            padding: "16px",
            boxShadow: "var(--sh-sm)",
            display: "flex",
            alignItems: "center",
            gap: 14,
            opacity: 0.7,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: "var(--n2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            🔒
          </div>
          <div>
            <div
              style={{
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 700,
                fontSize: 13,
                color: "var(--n9)",
                marginBottom: 3,
              }}
            >
              Fantasy League
            </div>
            <div
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 12,
                color: "var(--n5)",
                lineHeight: 1.4,
              }}
            >
              Coming when we can auto-sync match data
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
