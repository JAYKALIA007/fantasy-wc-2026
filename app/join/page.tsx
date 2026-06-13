import { SignInButton } from "./sign-in-button";

interface JoinPageProps {
  searchParams: Promise<{ code?: string; error?: string }>;
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const params = await searchParams;
  const inviteCode = params.code ?? "";
  const expectedCode = process.env.NEXT_PUBLIC_LEAGUE_INVITE_CODE ?? "";

  const isValidCode = expectedCode.length > 0 && inviteCode === expectedCode;

  if (!isValidCode) {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center px-6"
        style={{ backgroundColor: "var(--n0)" }}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-8 text-center"
          style={{
            backgroundColor: "var(--n1)",
            boxShadow: "var(--sh-lg)",
          }}
        >
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--r0)" }}
          >
            <span style={{ fontSize: 28 }}>🚫</span>
          </div>
          <h1
            className="mb-2 text-xl font-bold"
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              color: "var(--n9)",
            }}
          >
            Invalid Invite
          </h1>
          <p style={{ color: "var(--n6)", fontSize: 14 }}>
            This invite link is invalid or has expired. Ask your league admin
            for a valid link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ backgroundColor: "var(--n0)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center"
        style={{
          backgroundColor: "var(--n1)",
          boxShadow: "var(--sh-lg)",
        }}
      >
        {/* Logo / title */}
        <div className="mb-6">
          <p
            className="text-5xl font-bold leading-none"
            style={{
              fontFamily: "var(--font-anton), sans-serif",
              color: "var(--g4)",
            }}
          >
            WC
          </p>
          <p
            className="text-5xl font-bold leading-none"
            style={{
              fontFamily: "var(--font-anton), sans-serif",
              color: "var(--surf)",
            }}
          >
            2026
          </p>
          <p
            className="mt-2 text-sm font-semibold uppercase tracking-widest"
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              color: "var(--n6)",
            }}
          >
            Fantasy League
          </p>
        </div>

        <p className="mb-8 text-sm" style={{ color: "var(--n7)" }}>
          You&apos;ve been invited to join the league. Enter your email to
          claim your spot.
        </p>

        <SignInButton inviteCode={inviteCode} />

        {params.error && (
          <p
            className="mt-4 rounded-lg p-3 text-sm"
            style={{
              backgroundColor: "var(--rbg)",
              color: "var(--r1)",
            }}
          >
            Sign-in failed. Please try again.
          </p>
        )}
      </div>
    </main>
  );
}
