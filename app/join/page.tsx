import { SignInButton } from "./sign-in-button";

interface JoinPageProps {
  searchParams: Promise<{ code?: string; error?: string }>;
}

const STARS = ["✦", "✧", "★", "✦", "✧", "✦"];

function Hero() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "56px 24px 40px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative stars */}
      {STARS.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            color: "var(--gold)",
            opacity: 0.25 + (i % 3) * 0.15,
            fontSize: i % 2 === 0 ? 10 : 7,
            top: `${10 + (i * 13) % 55}%`,
            left: `${5 + (i * 17) % 90}%`,
            pointerEvents: "none",
          }}
        >
          {s}
        </span>
      ))}

      {/* Football icon */}
      <div style={{ fontSize: 56, marginBottom: 20, lineHeight: 1 }}>⚽</div>

      {/* FIFA WORLD CUP text */}
      <p
        style={{
          fontFamily: "var(--font-anton), sans-serif",
          fontSize: 20,
          letterSpacing: "0.25em",
          color: "rgba(255,255,255,0.5)",
          textTransform: "uppercase",
          margin: 0,
          lineHeight: 1,
        }}
      >
        FIFA World Cup
      </p>
      <p
        style={{
          fontFamily: "var(--font-anton), sans-serif",
          fontSize: 80,
          color: "var(--gold)",
          letterSpacing: "0.05em",
          margin: 0,
          lineHeight: 1,
          textShadow: "0 0 40px rgba(245,181,10,0.4)",
        }}
      >
        2026
      </p>

      {/* Divider line */}
      <div
        style={{
          margin: "12px auto",
          width: 48,
          height: 2,
          borderRadius: 2,
          background: "linear-gradient(90deg, transparent, var(--gold), transparent)",
        }}
      />

      <p
        style={{
          fontFamily: "var(--font-saira), sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.3em",
          color: "rgba(255,255,255,0.45)",
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        Fantasy League
      </p>
    </div>
  );
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const params = await searchParams;
  const inviteCode = params.code ?? "";
  const expectedCode = process.env.NEXT_PUBLIC_LEAGUE_INVITE_CODE ?? "";
  const isValidCode = expectedCode.length > 0 && inviteCode === expectedCode;

  const bgStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #060d1a 0%, #120820 50%, #060f10 100%)",
    display: "flex",
    flexDirection: "column",
  };

  const sheetStyle: React.CSSProperties = {
    flex: 1,
    backgroundColor: "#0e1726cc",
    backdropFilter: "blur(12px)",
    borderRadius: "24px 24px 0 0",
    padding: "28px 24px 40px",
    maxWidth: 440,
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
  };

  if (!isValidCode) {
    return (
      <main style={bgStyle}>
        <Hero />
        <div style={sheetStyle}>
          <p
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 800,
              fontSize: 18,
              color: "#eef1f6",
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            Private League
          </p>
          <p
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 14,
              textAlign: "center",
              marginBottom: 24,
              lineHeight: 1.5,
            }}
          >
            This league is invite-only. Ask your admin for the invite link to join.
          </p>

          <NoCodeForm />
        </div>
      </main>
    );
  }

  return (
    <main style={bgStyle}>
      <Hero />
      <div style={sheetStyle}>
        <p
          style={{
            fontFamily: "var(--font-saira), sans-serif",
            fontWeight: 800,
            fontSize: 18,
            color: "#eef1f6",
            marginBottom: 6,
            textAlign: "center",
          }}
        >
          You&apos;re invited!
        </p>
        <p
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: 13,
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          Sign in to claim your spot in the league.
        </p>

        <SignInButton inviteCode={inviteCode} />

        {params.error && (
          <p
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 10,
              backgroundColor: "rgba(178, 0, 26, 0.2)",
              border: "1px solid rgba(178, 0, 26, 0.4)",
              color: "#ff6570",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            Sign-in failed. Please try again.
          </p>
        )}
      </div>
    </main>
  );
}

function NoCodeForm() {
  return (
    <form
      action="/join"
      method="get"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <input
        name="code"
        type="text"
        placeholder="Paste your invite code"
        style={{
          width: "100%",
          padding: "13px 16px",
          borderRadius: 10,
          border: "1.5px solid rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.06)",
          color: "#eef1f6",
          fontFamily: "var(--font-inter), sans-serif",
          fontSize: 15,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      <button
        type="submit"
        style={{
          width: "100%",
          padding: "13px 16px",
          borderRadius: 10,
          border: "none",
          backgroundColor: "var(--gold)",
          color: "#0a0600",
          fontFamily: "var(--font-saira), sans-serif",
          fontWeight: 800,
          fontSize: 15,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          cursor: "pointer",
        }}
      >
        Join →
      </button>
    </form>
  );
}
