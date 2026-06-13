export default function WaitlistPage() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ backgroundColor: "var(--n0)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center"
        style={{ backgroundColor: "var(--n1)", boxShadow: "var(--sh-lg)" }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--n3)" }}
        >
          <span style={{ fontSize: 28 }}>⏳</span>
        </div>
        <h1
          className="mb-2 text-2xl font-bold"
          style={{
            fontFamily: "var(--font-saira), sans-serif",
            color: "var(--n9)",
          }}
        >
          Referral Pending
        </h1>
        <p className="mb-4 text-sm" style={{ color: "var(--n7)" }}>
          You&apos;re on the waitlist. The league is full right now — we&apos;ll
          notify you when a spot opens up.
        </p>
        <p className="text-xs" style={{ color: "var(--n6)" }}>
          Ask a current member to refer you to speed things up.
        </p>
      </div>
    </main>
  );
}
