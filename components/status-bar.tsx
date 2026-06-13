export function StatusBar() {
  return (
    <div
      className="flex h-8 w-full shrink-0 items-center justify-between px-4"
      style={{ backgroundColor: "var(--n0)" }}
      aria-hidden="true"
    >
      <span
        className="text-xs font-semibold"
        style={{
          fontFamily: "var(--font-saira), sans-serif",
          color: "var(--n7)",
        }}
      >
        9:41
      </span>
      <span
        className="text-xs font-semibold"
        style={{
          fontFamily: "var(--font-saira), sans-serif",
          color: "var(--n7)",
        }}
      >
        WC·IST
      </span>
      <div className="flex items-center gap-1">
        {/* Signal bars */}
        <SignalIcon />
        {/* Battery */}
        <BatteryIcon />
      </div>
    </div>
  );
}

function SignalIcon() {
  return (
    <svg
      width="14"
      height="12"
      viewBox="0 0 14 12"
      fill="none"
      aria-hidden="true"
    >
      <rect x="0" y="8" width="2.5" height="4" rx="0.5" fill="#b3c1cf" />
      <rect x="3.5" y="5.5" width="2.5" height="6.5" rx="0.5" fill="#b3c1cf" />
      <rect x="7" y="3" width="2.5" height="9" rx="0.5" fill="#b3c1cf" />
      <rect
        x="10.5"
        y="0"
        width="2.5"
        height="12"
        rx="0.5"
        fill="#b3c1cf"
        opacity="0.4"
      />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg
      width="22"
      height="12"
      viewBox="0 0 22 12"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="0.5"
        y="0.5"
        width="18"
        height="11"
        rx="2.5"
        stroke="#b3c1cf"
        strokeOpacity="0.6"
      />
      <rect x="2" y="2" width="13" height="8" rx="1.5" fill="#1dce72" />
      <path
        d="M19.5 4v4a1.5 1.5 0 000-4z"
        fill="#b3c1cf"
        fillOpacity="0.6"
      />
    </svg>
  );
}
