"use client";

import { useState, useEffect } from "react";

const DISMISSED_KEY = "ios-install-prompt-dismissed";

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad/.test(ua);
  const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !isStandalone;
}

export function IosInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const wasDismissed = sessionStorage.getItem(DISMISSED_KEY) === "true";
    if (!wasDismissed && isIosSafari()) {
      setShow(true);
    }
  }, []);

  function handleDismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "true");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: 16,
        right: 16,
        zIndex: 49,
        background: "var(--n0)",
        borderRadius: 16,
        padding: "14px 16px",
        boxShadow: "var(--sh-lg)",
        border: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1.2 }}>📲</div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--font-saira), sans-serif",
            fontWeight: 700,
            fontSize: 13,
            color: "#fff",
            marginBottom: 3,
          }}
        >
          Add to Home Screen
        </div>
        <div
          style={{
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 12,
            color: "rgba(255,255,255,0.6)",
            lineHeight: 1.4,
          }}
        >
          For the best experience — tap{" "}
          <span style={{ color: "rgba(255,255,255,0.85)" }}>Share</span> then{" "}
          <span style={{ color: "rgba(255,255,255,0.85)" }}>
            &apos;Add to Home Screen&apos;
          </span>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "rgba(255,255,255,0.4)",
          fontSize: 18,
          padding: 0,
          flexShrink: 0,
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
