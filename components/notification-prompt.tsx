"use client";

import { useState, useEffect } from "react";
import { usePushNotifications } from "@/lib/hooks/use-push-notifications";

const DISMISSED_KEY = "notification-prompt-dismissed";

export function NotificationPrompt() {
  const { isSupported, permission, requestPermission } = usePushNotifications();
  const [dismissed, setDismissed] = useState(true); // default true to avoid flash

  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISSED_KEY) === "true";
    setDismissed(wasDismissed);
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  async function handleEnable() {
    await requestPermission();
    setDismissed(true);
  }

  if (!isSupported || permission !== "default" || dismissed) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: 16,
        right: 16,
        zIndex: 50,
        background: "var(--n1)",
        borderRadius: 16,
        padding: "16px",
        boxShadow: "var(--sh-lg)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            fontSize: 24,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          🔔
        </div>
        <div>
          <div
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 14,
              color: "#fff",
              marginBottom: 4,
            }}
          >
            Stay in the game
          </div>
          <div
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 13,
              color: "rgba(255,255,255,0.65)",
              lineHeight: 1.4,
            }}
          >
            Enable notifications to get match reminders and leaderboard updates
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleEnable}
          style={{
            flex: 1,
            padding: "10px 0",
            borderRadius: 10,
            background: "var(--g3)",
            color: "#fff",
            fontFamily: "var(--font-saira), sans-serif",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            cursor: "pointer",
          }}
        >
          Enable
        </button>
        <button
          onClick={handleDismiss}
          style={{
            flex: 1,
            padding: "10px 0",
            borderRadius: 10,
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.7)",
            fontFamily: "var(--font-saira), sans-serif",
            fontWeight: 600,
            fontSize: 14,
            border: "1.5px solid rgba(255,255,255,0.12)",
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
