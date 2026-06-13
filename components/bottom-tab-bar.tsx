"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TabItem {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  badge?: boolean;
}

const tabs: TabItem[] = [
  {
    href: "/",
    label: "Home",
    icon: (active) => <HouseIcon active={active} />,
  },
  {
    href: "/predict",
    label: "Predict",
    icon: (active) => <TargetIcon active={active} />,
    badge: true,
  },
  {
    href: "/squad",
    label: "Squad",
    icon: (active) => <JerseyIcon active={active} />,
  },
  {
    href: "/ranks",
    label: "Ranks",
    icon: (active) => <TrophyIcon active={active} />,
  },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex h-[62px] w-full shrink-0 items-stretch"
      style={{ backgroundColor: "var(--n1)", borderTop: "1px solid var(--n2)" }}
      aria-label="Main navigation"
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-opacity active:opacity-70"
            aria-current={isActive ? "page" : undefined}
          >
            <span className="relative">
              {tab.icon(isActive)}
              {tab.badge && !isActive && (
                <span
                  className="absolute -right-1 -top-1 h-2 w-2 rounded-full"
                  style={{ backgroundColor: "var(--r2)" }}
                  aria-label="predictions due"
                />
              )}
            </span>
            <span
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={{
                fontFamily: "var(--font-saira), sans-serif",
                color: isActive ? "var(--g4)" : "var(--n6)",
              }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function HouseIcon({ active }: { active: boolean }) {
  const color = active ? "var(--g4)" : "var(--n6)";
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 21V12h6v9"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TargetIcon({ active }: { active: boolean }) {
  const color = active ? "var(--g4)" : "var(--n6)";
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" stroke={color} strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.5" fill={color} />
    </svg>
  );
}

function JerseyIcon({ active }: { active: boolean }) {
  const color = active ? "var(--g4)" : "var(--n6)";
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 3L2 7l3 2v11h14V9l3-2-4-4c0 0-1.5 3-4 3S6 3 6 3z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrophyIcon({ active }: { active: boolean }) {
  const color = active ? "var(--g4)" : "var(--n6)";
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 21h8M12 17v4M5 3H3v4a4 4 0 004 4h1M19 3h2v4a4 4 0 01-4 4h-1"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 3h8v6a4 4 0 01-8 0V3z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
