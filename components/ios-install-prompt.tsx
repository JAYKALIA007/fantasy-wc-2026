"use client";

import { useState, useEffect, useRef } from "react";

const DISMISSED_KEY = "install-prompt-dismissed";

type Mode = "android" | "ios" | null;

function detectMode(): Mode {
  if (typeof window === "undefined") return null;
  const ua = navigator.userAgent;
  const isStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (isStandalone) return null;
  if (/iPhone|iPad/.test(ua)) return "ios";
  return null; // android mode set when beforeinstallprompt fires
}

export function IosInstallPrompt() {
  const [mode, setMode] = useState<Mode>(null);
  const deferredPrompt = useRef<Event & { prompt(): Promise<void> } | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) === "true") return;

    const detectedMode = detectMode();
    if (detectedMode === "ios") {
      setMode("ios");
      return;
    }

    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      deferredPrompt.current = e as Event & { prompt(): Promise<void> };
      setMode("android");
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setMode(null);
  }

  async function handleInstall() {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    deferredPrompt.current = null;
    setMode(null);
  }

  if (!mode) return null;

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
          Skip Chrome every time
        </div>
        {mode === "ios" ? (
          <div
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 12,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.4,
            }}
          >
            Tap{" "}
            <span style={{ color: "rgba(255,255,255,0.85)" }}>Share</span> →{" "}
            <span style={{ color: "rgba(255,255,255,0.85)" }}>
              Add to Home Screen
            </span>{" "}
            to install the app.
          </div>
        ) : (
          <div
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 12,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.4,
            }}
          >
            Install FantasyWC as an app — open it directly from your home
            screen.
          </div>
        )}
        {mode === "android" && (
          <button
            onClick={handleInstall}
            style={{
              marginTop: 8,
              padding: "6px 14px",
              borderRadius: 8,
              background: "var(--g3)",
              border: "none",
              color: "#fff",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Install
          </button>
        )}
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
