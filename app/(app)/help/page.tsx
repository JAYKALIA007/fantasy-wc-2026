import Link from "next/link";

const APP_URL = "https://fantasy-wc-2026-ashy.vercel.app";

export default function HelpPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", backgroundColor: "var(--bg)" }}>
      {/* Header */}
      <div style={{ background: "var(--surf)", padding: "14px 16px 12px", borderBottom: "1px solid rgba(14,23,38,0.07)", display: "flex", alignItems: "center", gap: 12 }}>
        <Link
          href="/"
          style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surf2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--n3)", flexShrink: 0, textDecoration: "none" }}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 6L8 11l6 5" />
          </svg>
        </Link>
        <span style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 17, color: "var(--n0)" }}>
          Help & Setup
        </span>
      </div>

      <div style={{ padding: "20px 16px 80px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Match reminders section */}
        <div style={{ background: "var(--n1)", borderRadius: 16, padding: "18px 16px", boxShadow: "var(--sh-md)" }}>
          <h2 style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 15, color: "var(--n9)", textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 6px" }}>
            🔔 Enable Match Reminders
          </h2>
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n6)", margin: "0 0 16px", lineHeight: 1.5 }}>
            Get a notification 1 hour before every match so you never miss a prediction.
          </p>

          {/* Android */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13, color: "var(--n9)", marginBottom: 10 }}>
              Android (Chrome) 📱
            </div>
            {[
              "Open the app link in Chrome",
              "Tap the 3-dot menu (top right) → Add to Home Screen → Install",
              "Open the app from your home screen",
              "Tap Enable when you see the notification prompt",
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--n2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, color: "var(--n6)" }}>
                  {i + 1}
                </div>
                <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n9)", margin: 0, lineHeight: 1.5, paddingTop: 2 }}>
                  {step}
                </p>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--n2)", margin: "0 0 16px" }} />

          {/* iPhone */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 13, color: "var(--n9)", marginBottom: 10 }}>
              iPhone (Safari) 🍎
            </div>
            {[
              "Open the app link in Safari (not Chrome)",
              "Tap the Share button (box with arrow at the bottom)",
              "Tap Add to Home Screen → Add",
              "Open the app from your home screen",
              "Tap Enable when you see the notification prompt",
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--n2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 11, color: "var(--n6)" }}>
                  {i + 1}
                </div>
                <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n9)", margin: 0, lineHeight: 1.5, paddingTop: 2 }}>
                  {step}
                </p>
              </div>
            ))}
          </div>

          {/* App link */}
          <div style={{ background: "var(--n2)", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n6)" }}>App link</span>
            <span style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--g3)", fontWeight: 600 }}>{APP_URL}</span>
          </div>
        </div>

        {/* Troubleshooting */}
        <div style={{ background: "var(--surf)", borderRadius: 16, padding: "16px", boxShadow: "var(--sh-sm)" }}>
          <h2 style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 800, fontSize: 13, color: "var(--n0)", textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 12px" }}>
            ⚠️ Not seeing the Enable prompt?
          </h2>
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--n5)", margin: 0, lineHeight: 1.6 }}>
            Go to your browser Settings → Site Settings → find the app URL → Clear &amp; Reset → reopen the app from the home screen icon.
          </p>
          <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n6)", margin: "10px 0 0", lineHeight: 1.5 }}>
            iPhone requires iOS 16.4 or newer and Safari (not Chrome) for push notifications to work.
          </p>
        </div>

        {/* Scoring rules link */}
        <Link href="/rules" style={{ display: "block", textDecoration: "none" }}>
          <div style={{ background: "var(--surf)", borderRadius: 14, padding: "14px 16px", boxShadow: "var(--sh-sm)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-saira), sans-serif", fontWeight: 700, fontSize: 14, color: "var(--n0)" }}>Scoring rules</div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 12, color: "var(--n5)", marginTop: 2 }}>How predictions and nation bonus points work</div>
            </div>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--n6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </div>
        </Link>

      </div>
    </div>
  );
}
