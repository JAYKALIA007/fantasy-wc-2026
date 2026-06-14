import type { CSSProperties } from "react";

export type CardType = "gold" | "toty" | "tots" | "icon" | "hero" | "otw";
export type CardSize = "sm" | "md" | "lg";

interface FifaCardProps {
  initials: string;
  rating: number;
  position: string;
  nation: string;
  footballerName: string;
  cardType: CardType;
  size?: CardSize;
  selected?: boolean;
  taken?: boolean;
}

const CARD_WIDTHS: Record<CardSize, number> = {
  sm: 56,
  md: 90,
  lg: 130,
};

const CARD_THEMES: Record<
  CardType,
  {
    background: string;
    border: string;
    textColor: string;
    accentColor: string;
    label: string;
    circleBg: string;
  }
> = {
  icon: {
    background: "linear-gradient(160deg, #1a0533 0%, #3d0f6b 100%)",
    border: "#d4af37",
    textColor: "#d4af37",
    accentColor: "#d4af37",
    label: "ICON",
    circleBg: "rgba(212,175,55,0.18)",
  },
  toty: {
    background: "linear-gradient(160deg, #080808 0%, #1a1a1a 100%)",
    border: "#c9960c",
    textColor: "#c9960c",
    accentColor: "#c9960c",
    label: "TOTY",
    circleBg: "rgba(201,150,12,0.15)",
  },
  tots: {
    background: "linear-gradient(160deg, #003020 0%, #005535 100%)",
    border: "#00e676",
    textColor: "#00e676",
    accentColor: "#00e676",
    label: "TOTS",
    circleBg: "rgba(0,230,118,0.12)",
  },
  hero: {
    background:
      "linear-gradient(135deg, #0a1628 50%, #280a0a 50%)",
    border: "#ffffff",
    textColor: "#ffffff",
    accentColor: "#ffffff",
    label: "HERO",
    circleBg: "rgba(255,255,255,0.1)",
  },
  otw: {
    background: "linear-gradient(160deg, #7a2800 0%, #c44000 100%)",
    border: "#ff7c2a",
    textColor: "#ffffff",
    accentColor: "#ff7c2a",
    label: "OTW",
    circleBg: "rgba(255,124,42,0.18)",
  },
  gold: {
    background: "linear-gradient(160deg, #7a5a0a 0%, #c9960c 50%, #7a5a0a 100%)",
    border: "#3a2800",
    textColor: "#1a0f00",
    accentColor: "#3a2800",
    label: "GOLD",
    circleBg: "rgba(58,40,0,0.15)",
  },
};

export function FifaCard({
  initials,
  rating,
  position,
  nation,
  footballerName,
  cardType,
  size = "md",
  selected = false,
  taken = false,
}: FifaCardProps) {
  const width = CARD_WIDTHS[size];
  const height = Math.round(width * (4 / 3));
  const theme = CARD_THEMES[cardType];

  const scale = width / 90; // md is the base size

  const containerStyle: CSSProperties = {
    position: "relative",
    width,
    height,
    borderRadius: Math.round(6 * scale),
    background: theme.background,
    border: `${selected ? 2.5 : 1.5}px solid ${selected ? "var(--g3)" : theme.border}`,
    boxShadow: selected
      ? `0 0 0 2px var(--g3), 0 4px 14px rgba(0,0,0,0.5)`
      : `0 3px 10px rgba(0,0,0,0.4)`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    overflow: "hidden",
    cursor: taken ? "not-allowed" : "pointer",
    opacity: taken ? 0.5 : 1,
    flexShrink: 0,
    transition: "border-color 0.15s, box-shadow 0.15s",
    userSelect: "none",
  };

  const topRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
    padding: `${Math.round(5 * scale)}px ${Math.round(5 * scale)}px 0`,
    boxSizing: "border-box",
  };

  const ratingStyle: CSSProperties = {
    fontFamily: "var(--font-anton), sans-serif",
    fontSize: Math.round(18 * scale),
    color: theme.textColor,
    lineHeight: 1,
  };

  const positionStyle: CSSProperties = {
    fontFamily: "var(--font-saira), sans-serif",
    fontWeight: 700,
    fontSize: Math.round(8 * scale),
    color: theme.textColor,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 1,
    textAlign: "center",
  };

  const labelStyle: CSSProperties = {
    fontFamily: "var(--font-saira), sans-serif",
    fontWeight: 800,
    fontSize: Math.round(7 * scale),
    color: theme.textColor,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    border: `1px solid ${theme.border}`,
    borderRadius: Math.round(3 * scale),
    padding: `${Math.round(1 * scale)}px ${Math.round(3 * scale)}px`,
  };

  const circleSize = Math.round(42 * scale);
  const circleStyle: CSSProperties = {
    width: circleSize,
    height: circleSize,
    borderRadius: "50%",
    backgroundColor: theme.circleBg,
    border: `1.5px solid ${theme.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Math.round(3 * scale),
    flexShrink: 0,
  };

  const initialsStyle: CSSProperties = {
    fontFamily: "var(--font-anton), sans-serif",
    fontSize: Math.round(16 * scale),
    color: theme.textColor,
    letterSpacing: 0.5,
  };

  const nameStyle: CSSProperties = {
    fontFamily: "var(--font-saira), sans-serif",
    fontWeight: 700,
    fontSize: Math.round(9 * scale),
    color: theme.textColor,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
    marginTop: Math.round(3 * scale),
    lineHeight: 1.1,
    maxWidth: "90%",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  };

  const nationStyle: CSSProperties = {
    fontFamily: "var(--font-saira), sans-serif",
    fontWeight: 600,
    fontSize: Math.round(7 * scale),
    color: theme.textColor,
    opacity: 0.7,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: Math.round(2 * scale),
  };

  const accentBarStyle: CSSProperties = {
    width: "100%",
    height: Math.round(3 * scale),
    backgroundColor: theme.accentColor,
    opacity: 0.6,
    marginTop: "auto",
    flexShrink: 0,
  };

  return (
    <div style={containerStyle}>
      {/* Top row: rating+pos on left, label on right */}
      <div style={topRowStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={ratingStyle}>{rating}</span>
          <span style={positionStyle}>{position.toUpperCase()}</span>
        </div>
        <span style={labelStyle}>{theme.label}</span>
      </div>

      {/* Initials circle */}
      <div style={circleStyle}>
        <span style={initialsStyle}>{initials}</span>
      </div>

      {/* Name */}
      <span style={nameStyle}>{footballerName}</span>

      {/* Nation */}
      <span style={nationStyle}>{nation}</span>

      {/* Accent bar */}
      <div style={accentBarStyle} />

      {/* Taken overlay */}
      {taken && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: Math.round(6 * scale),
            backgroundColor: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 800,
              fontSize: Math.round(8 * scale),
              color: "#fff",
              letterSpacing: 1,
              backgroundColor: "rgba(0,0,0,0.6)",
              padding: `${Math.round(2 * scale)}px ${Math.round(5 * scale)}px`,
              borderRadius: 3,
            }}
          >
            TAKEN
          </span>
        </div>
      )}
    </div>
  );
}
