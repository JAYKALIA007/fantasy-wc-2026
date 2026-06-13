"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Avatar = {
  id: string;
  footballer_name: string;
  initials: string;
  nation: string;
  position: string;
};

type League = {
  id: string;
  name: string;
  max_players: number;
};

type Props = {
  userEmail: string;
  userId: string;
  league: League;
  avatars: Avatar[];
  initialTakenAvatarIds: string[];
  memberCount: number;
};

const POS_COLORS: Record<string, string> = {
  gk: "var(--pos-gk)",
  def: "var(--pos-def)",
  mid: "var(--pos-mid)",
  fwd: "var(--pos-fwd)",
};

const STEP_LABELS = [
  "Invite",
  "Sign in",
  "Avatar",
  "Profile",
];

export default function OnboardingClient({
  userEmail,
  userId,
  league,
  avatars,
  initialTakenAvatarIds,
  memberCount: initialMemberCount,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [takenIds, setTakenIds] = useState<Set<string>>(
    new Set(initialTakenAvatarIds)
  );
  const [memberCount, setMemberCount] = useState(initialMemberCount);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — auto-advance after 1s
  useEffect(() => {
    if (step === 1) {
      const t = setTimeout(() => setStep(2), 1000);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Step 2 — auto-advance after 1s
  useEffect(() => {
    if (step === 2) {
      const t = setTimeout(() => setStep(3), 1000);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Step 3 — subscribe to realtime
  useEffect(() => {
    if (step !== 3 || !league.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel("league_members_inserts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "league_members",
          filter: `league_id=eq.${league.id}`,
        },
        (payload) => {
          const row = payload.new as { avatar_id: string };
          if (row.avatar_id) {
            setTakenIds((prev) => new Set([...prev, row.avatar_id]));
            setMemberCount((c) => c + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [step, league.id]);

  const handleSave = useCallback(async () => {
    if (!selectedAvatarId || !profileName.trim() || !league.id) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    await supabase.from("profiles").upsert({ id: userId });
    const { error: insertError } = await supabase.from("league_members").insert({
      league_id: league.id,
      user_id: userId,
      profile_name: profileName.trim(),
      avatar_id: selectedAvatarId,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    router.push("/");
  }, [selectedAvatarId, profileName, league.id, userId, router]);

  const progress = (step / 4) * 100;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        backgroundColor: "var(--bg)",
        maxWidth: 430,
        margin: "0 auto",
        position: "relative",
      }}
    >
      {/* Step Header */}
      <div
        style={{
          backgroundColor: "var(--surf)",
          flexShrink: 0,
          padding: "16px 16px 14px",
          borderBottom: "1px solid rgba(14,23,38,.07)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              color: "var(--n5)",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
            }}
          >
            Step {step} of 4
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              color: "var(--g3)",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            {STEP_LABELS[step - 1]}
          </span>
        </div>

        {/* Progress dots */}
        <div
          style={{
            display: "flex",
            gap: 7,
            justifyContent: "flex-start",
            marginBottom: 10,
          }}
        >
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              style={{
                width: s < step ? 22 : s === step ? 22 : 7,
                height: 7,
                borderRadius: 4,
                backgroundColor:
                  s < step
                    ? "var(--g3)"
                    : s === step
                    ? "var(--n0)"
                    : "var(--n8)",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: "var(--n8)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              backgroundColor: "var(--g3)",
              borderRadius: 2,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 0" }}>
        {step === 1 && <StepInvite />}
        {step === 2 && <StepSignedIn email={userEmail} />}
        {step === 3 && (
          <StepAvatar
            avatars={avatars}
            takenIds={takenIds}
            selectedId={selectedAvatarId}
            onSelect={(id) => setSelectedAvatarId(id)}
          />
        )}
        {step === 4 && (
          <StepProfile
            profileName={profileName}
            onChange={setProfileName}
            error={error}
          />
        )}
      </div>

      {/* Bottom Tray */}
      {step === 3 && (
        <div
          style={{
            flexShrink: 0,
            backgroundColor: "var(--surf)",
            borderTop: "1px solid rgba(14,23,38,.07)",
            padding: "12px 14px 14px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: "var(--n5)",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              Joined via invite ✓
            </span>
            <span
              style={{
                fontSize: 12,
                fontFamily: "var(--font-saira), sans-serif",
                fontWeight: 700,
                color: "var(--n5)",
                border: "1px solid var(--n7)",
                borderRadius: 6,
                padding: "2px 8px",
              }}
            >
              {memberCount}/{league.max_players}
            </span>
          </div>
          <button
            onClick={() => setStep(4)}
            disabled={!selectedAvatarId}
            style={{
              display: "block",
              width: "100%",
              padding: "14px 0",
              borderRadius: 12,
              border: "none",
              cursor: selectedAvatarId ? "pointer" : "not-allowed",
              backgroundColor: selectedAvatarId ? "var(--g3)" : "var(--n8)",
              color: selectedAvatarId ? "#fff" : "var(--n5)",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 16,
              transition: "background-color 0.2s",
            }}
          >
            Continue →
          </button>
        </div>
      )}

      {step === 4 && (
        <div
          style={{
            flexShrink: 0,
            backgroundColor: "var(--surf)",
            borderTop: "1px solid rgba(14,23,38,.07)",
            padding: "12px 14px 14px",
          }}
        >
          <button
            onClick={handleSave}
            disabled={!profileName.trim() || saving}
            style={{
              display: "block",
              width: "100%",
              padding: "14px 0",
              borderRadius: 12,
              border: "none",
              cursor:
                profileName.trim() && !saving ? "pointer" : "not-allowed",
              backgroundColor:
                profileName.trim() && !saving ? "var(--g3)" : "var(--n8)",
              color:
                profileName.trim() && !saving ? "#fff" : "var(--n5)",
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 16,
              transition: "background-color 0.2s",
            }}
          >
            {saving ? "Saving…" : "Join the league →"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Step 1: Invite verified ─────────────────────── */
function StepInvite() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 60,
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          backgroundColor: "var(--gbg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 28 }}>🏆</span>
      </div>
      <p
        style={{
          fontFamily: "var(--font-saira), sans-serif",
          fontWeight: 700,
          fontSize: 20,
          color: "var(--n0)",
        }}
      >
        Invite verified ✓
      </p>
    </div>
  );
}

/* ── Step 2: Signed in ───────────────────────────── */
function StepSignedIn({ email }: { email: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 60,
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          backgroundColor: "var(--gbg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 28 }}>✅</span>
      </div>
      <p
        style={{
          fontFamily: "var(--font-saira), sans-serif",
          fontWeight: 700,
          fontSize: 18,
          color: "var(--n0)",
          textAlign: "center",
        }}
      >
        Signed in as
      </p>
      <p
        style={{
          fontSize: 14,
          color: "var(--n4)",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        {email} ✓
      </p>
    </div>
  );
}

/* ── Step 3: Avatar grid ─────────────────────────── */
function StepAvatar({
  avatars,
  takenIds,
  selectedId,
  onSelect,
}: {
  avatars: Avatar[];
  takenIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ paddingBottom: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <h1
          style={{
            fontFamily: "var(--font-anton), sans-serif",
            fontSize: 28,
            color: "var(--n0)",
            margin: 0,
          }}
        >
          Pick your player
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--n5)",
            marginTop: 5,
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          Your identity in the league — first come, first served.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
        }}
      >
        {avatars.map((av) => {
          const isTaken = takenIds.has(av.id);
          const isSelected = selectedId === av.id;
          return (
            <AvatarTile
              key={av.id}
              avatar={av}
              isTaken={isTaken}
              isSelected={isSelected}
              onSelect={!isTaken ? () => onSelect(av.id) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

function AvatarTile({
  avatar,
  isTaken,
  isSelected,
  onSelect,
}: {
  avatar: Avatar;
  isTaken: boolean;
  isSelected: boolean;
  onSelect?: () => void;
}) {
  const posColor = POS_COLORS[avatar.position] ?? "var(--n4)";

  return (
    <div
      onClick={onSelect}
      style={{
        position: "relative",
        backgroundColor: "var(--surf)",
        borderRadius: 12,
        padding: "12px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        boxShadow: "var(--sh-sm)",
        cursor: isTaken ? "not-allowed" : "pointer",
        border: isSelected
          ? "2px solid var(--g3)"
          : "2px solid transparent",
        opacity: isTaken ? 0.5 : 1,
        transition: "border-color 0.15s, opacity 0.15s",
      }}
    >
      {/* Selected checkmark badge */}
      {isSelected && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: "50%",
            backgroundColor: "var(--g3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1.5 5l2.5 2.5 4.5-4.5" />
          </svg>
        </div>
      )}

      {/* Initials circle */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          backgroundColor: posColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontFamily: "var(--font-anton), sans-serif",
          fontSize: 18,
          letterSpacing: 1,
          flexShrink: 0,
        }}
      >
        {avatar.initials}
      </div>

      {/* Name */}
      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--font-inter), sans-serif",
          fontWeight: 600,
          color: "var(--n1)",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {avatar.footballer_name}
      </span>

      {/* Nation chip */}
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-saira), sans-serif",
          fontWeight: 700,
          color: "var(--g2)",
          backgroundColor: "var(--gbg)",
          borderLeft: "3px solid var(--g3)",
          padding: "2px 6px",
          borderRadius: "0 4px 4px 0",
          letterSpacing: "0.5px",
        }}
      >
        {avatar.nation}
      </div>

      {/* Taken overlay */}
      {isTaken && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
            backgroundColor: "rgba(255,255,255,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 800,
              color: "var(--n4)",
              letterSpacing: "1.5px",
              backgroundColor: "var(--n8)",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            TAKEN
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Step 4: Profile name ────────────────────────── */
function StepProfile({
  profileName,
  onChange,
  error,
}: {
  profileName: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  return (
    <div style={{ paddingBottom: 16 }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: "var(--font-anton), sans-serif",
            fontSize: 28,
            color: "var(--n0)",
            margin: 0,
          }}
        >
          Set your name
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--n5)",
            marginTop: 5,
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          This is how you&apos;ll appear on the leaderboard.
        </p>
      </div>

      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "var(--font-inter), sans-serif",
          color: "var(--n4)",
          marginBottom: 8,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
        }}
      >
        Your team name
      </label>
      <input
        type="text"
        value={profileName}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your team name"
        maxLength={40}
        style={{
          display: "block",
          width: "100%",
          padding: "14px 16px",
          borderRadius: 12,
          border: "2px solid var(--n8)",
          backgroundColor: "var(--surf)",
          fontSize: 16,
          fontFamily: "var(--font-inter), sans-serif",
          color: "var(--n0)",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--g3)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--n8)";
        }}
      />
      <p
        style={{
          fontSize: 12,
          color: "var(--n5)",
          marginTop: 8,
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        This is how you&apos;ll appear on the leaderboard
      </p>

      {error && (
        <p
          style={{
            fontSize: 13,
            color: "var(--r2)",
            marginTop: 12,
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
