"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import type { FootballPlayer, Position } from "@/lib/fantasy/types";

const POS_LABELS: Record<Position, string> = {
  gk: "GK",
  def: "DEF",
  mid: "MID",
  fwd: "FWD",
};

const POS_COLORS: Record<Position, string> = {
  gk: "var(--pos-gk)",
  def: "var(--pos-def)",
  mid: "var(--pos-mid)",
  fwd: "var(--pos-fwd)",
};

export interface SquadPlayerWithDetails {
  player_id: number;
  is_starting: boolean;
  is_captain: boolean;
  is_vice_captain: boolean;
  player: FootballPlayer & { eliminated?: boolean };
}

interface TransferWindow {
  id: string;
  round_id: string;
  window_number: number;
  opens_at: string;
  closes_at: string;
}

interface Props {
  squadPlayers: SquadPlayerWithDetails[];
  allPlayers: FootballPlayer[];
  leagueId: string;
  currentCap: number;
  transferWindows: TransferWindow[];
  roundLabel: string;
}

interface PendingTransfer {
  playerOut: SquadPlayerWithDetails;
  playerIn: FootballPlayer | null;
}

function formatTimeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "soon";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days !== 1 ? "s" : ""}`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? "s" : ""}`;
  const mins = Math.floor(diff / (1000 * 60));
  return `${mins} min${mins !== 1 ? "s" : ""}`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function TransfersClient({
  squadPlayers,
  allPlayers,
  leagueId,
  currentCap,
  transferWindows,
  roundLabel,
}: Props) {
  const [pending, setPending] = useState<PendingTransfer[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<SquadPlayerWithDetails | null>(null);
  const [pickerFilter, setPickerFilter] = useState<Position | "all">("all");
  const [pickerSearch, setPickerSearch] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  const [liveSquad, setLiveSquad] = useState<SquadPlayerWithDetails[]>(squadPlayers);
  const [liveCap, setLiveCap] = useState(currentCap);

  // Determine window status
  const now = Date.now();
  const openWindow = transferWindows.find((w) => {
    const opens = new Date(w.opens_at).getTime();
    const closes = new Date(w.closes_at).getTime();
    return now >= opens && now <= closes;
  });
  const isWindowOpen = !!openWindow;

  // Next window that hasn't opened yet
  const nextWindow = transferWindows
    .filter((w) => new Date(w.opens_at).getTime() > now)
    .sort((a, b) => new Date(a.opens_at).getTime() - new Date(b.opens_at).getTime())[0];

  // IDs of players currently being swapped out
  const pendingOutIds = useMemo(
    () => new Set(pending.map((t) => t.playerOut.player_id)),
    [pending]
  );
  // IDs of players picked as replacements
  const pendingInIds = useMemo(
    () => new Set(pending.filter((t) => t.playerIn).map((t) => t.playerIn!.id)),
    [pending]
  );

  const currentSquadIds = useMemo(
    () => new Set(liveSquad.map((p) => p.player_id)),
    [liveSquad]
  );

  // Pending cap effect: each non-free, non-replacement-picked transfer costs 1
  const pendingCapCost = useMemo(() => {
    if (isWindowOpen) return 0;
    return pending.filter((t) => {
      if (t.playerOut.player.eliminated) return false;
      return true;
    }).length;
  }, [pending, isWindowOpen]);

  const projectedCap = liveCap - pendingCapCost;

  const openPicker = useCallback((sp: SquadPlayerWithDetails) => {
    setPickerTarget(sp);
    setPickerFilter(sp.player.position);
    setPickerSearch("");
    setPickerOpen(true);
  }, []);

  const selectReplacement = useCallback(
    (player: FootballPlayer) => {
      if (!pickerTarget) return;
      setPending((prev) =>
        prev.map((t) =>
          t.playerOut.player_id === pickerTarget.player_id ? { ...t, playerIn: player } : t
        )
      );
      setPickerOpen(false);
      setPickerTarget(null);
    },
    [pickerTarget]
  );

  const markOut = useCallback(
    (sp: SquadPlayerWithDetails) => {
      // Already pending out — remove from tray
      if (pendingOutIds.has(sp.player_id)) {
        setPending((prev) => prev.filter((t) => t.playerOut.player_id !== sp.player_id));
        return;
      }
      setPending((prev) => [...prev, { playerOut: sp, playerIn: null }]);
    },
    [pendingOutIds]
  );

  const pickerPlayers = useMemo(() => {
    const occupiedIds = new Set([
      ...Array.from(currentSquadIds),
      ...Array.from(pendingInIds),
    ]);
    // Remove the player being swapped out from occupied list (they're being replaced)
    if (pickerTarget) occupiedIds.delete(pickerTarget.player_id);
    // Also remove pending-out players from occupied
    for (const id of pendingOutIds) occupiedIds.delete(id);

    return allPlayers.filter((p) => {
      if (occupiedIds.has(p.id)) return false;
      if (pickerFilter !== "all" && p.position !== pickerFilter) return false;
      if (pickerSearch && !p.name.toLowerCase().includes(pickerSearch.toLowerCase())) return false;
      return true;
    });
  }, [allPlayers, currentSquadIds, pendingInIds, pickerTarget, pendingOutIds, pickerFilter, pickerSearch]);

  const canConfirm = pending.length > 0 && pending.every((t) => t.playerIn !== null);

  const handleConfirm = useCallback(async () => {
    if (!canConfirm || !leagueId) return;
    setConfirming(true);
    setConfirmError(null);
    setConfirmSuccess(false);

    try {
      for (const t of pending) {
        const res = await fetch("/api/fantasy/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            league_id: leagueId,
            player_out_id: t.playerOut.player_id,
            player_in_id: t.playerIn!.id,
          }),
        });
        const json = (await res.json()) as {
          error?: string;
          success?: boolean;
          squad?: { squad_value_cap: number; players: SquadPlayerWithDetails[] };
        };
        if (!res.ok) {
          setConfirmError(json.error ?? "Transfer failed");
          setConfirming(false);
          return;
        }
        if (json.squad) {
          setLiveCap(Number(json.squad.squad_value_cap));
          // Update live squad from response
          if (json.squad.players && Array.isArray(json.squad.players)) {
            // Remap API response back to SquadPlayerWithDetails shape
            type ApiSquadPlayer = {
              player_id: number;
              is_starting: boolean;
              is_captain: boolean;
              is_vice_captain: boolean;
              football_players: {
                id: number;
                name: string;
                nation_id: number;
                position: string;
                current_price: number;
                nations:
                  | { flag_code: string; eliminated: boolean }
                  | Array<{ flag_code: string; eliminated: boolean }>
                  | null;
              };
            };
            const remapped: SquadPlayerWithDetails[] = (
              (json.squad.players as unknown) as ApiSquadPlayer[]
            ).map((sp) => {
              const fp = sp.football_players;
              const nObj = Array.isArray(fp.nations) ? fp.nations[0] : fp.nations;
              return {
                player_id: sp.player_id,
                is_starting: sp.is_starting,
                is_captain: sp.is_captain,
                is_vice_captain: sp.is_vice_captain,
                player: {
                  id: fp.id,
                  name: fp.name,
                  nation_id: fp.nation_id,
                  position: fp.position as Position,
                  current_price: Number(fp.current_price),
                  initial_price: Number(fp.current_price),
                  flag_code: nObj?.flag_code ?? "",
                  eliminated: nObj?.eliminated ?? false,
                },
              };
            });
            setLiveSquad(remapped);
          }
        }
      }
      setPending([]);
      setConfirmSuccess(true);
    } catch {
      setConfirmError("Network error. Please try again.");
    } finally {
      setConfirming(false);
    }
  }, [canConfirm, leagueId, pending]);

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg)" }}>
      {/* Page header */}
      <div
        className="flex h-[54px] shrink-0 items-center gap-2 px-4"
        style={{ background: "var(--surf)", borderBottom: "1px solid rgba(14,23,38,.08)" }}
      >
        <Link
          href="/squad"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: "var(--surf2)" }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M14 6L8 11l6 5"
              stroke="var(--n0)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className="flex grow flex-col gap-0.5">
          <span
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 800,
              fontSize: 18,
              textTransform: "uppercase",
              letterSpacing: ".4px",
              lineHeight: 1.1,
            }}
          >
            Transfers
          </span>
          <span
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--n5)",
              textTransform: "uppercase",
              letterSpacing: ".3px",
            }}
          >
            {roundLabel} ·{" "}
            {isWindowOpen
              ? `Window ${openWindow!.window_number} open`
              : "Window closed"}
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
          style={{
            background: isWindowOpen ? "var(--gbg)" : "var(--rbg)",
            color: isWindowOpen ? "var(--g1)" : "var(--r1)",
            border: `1.5px solid ${isWindowOpen ? "var(--g3)" : "var(--r2)"}`,
            fontFamily: "var(--font-saira), sans-serif",
          }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: isWindowOpen ? "var(--g3)" : "var(--r2)",
              animation: isWindowOpen ? "pulse 1.5s infinite" : "none",
            }}
          />
          {isWindowOpen ? "Open" : "Closed"}
        </span>
      </div>

      {/* Window banner */}
      <div
        className="shrink-0 px-4 py-2.5"
        style={{
          background: isWindowOpen ? "var(--gbg)" : "var(--rbg)",
          borderBottom: `1.5px solid ${isWindowOpen ? "rgba(0,184,92,.2)" : "rgba(226,59,72,.2)"}`,
        }}
      >
        {isWindowOpen ? (
          <p
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontSize: 13,
              color: "var(--g1)",
              margin: 0,
            }}
          >
            Transfer window open — free transfers until{" "}
            <strong style={{ color: "var(--g0)" }}>
              {formatTime(openWindow!.closes_at)}
            </strong>
            . Make as many as you want.
          </p>
        ) : (
          <p
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontSize: 13,
              color: "var(--r1)",
              margin: 0,
            }}
          >
            Outside a window — each transfer costs{" "}
            <strong style={{ color: "var(--r0)" }}>−1 cap</strong>.
            {nextWindow
              ? ` Next free window in ${formatTimeUntil(nextWindow.opens_at)}.`
              : " No upcoming windows scheduled."}
          </p>
        )}
      </div>

      {/* Squad list */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span
            className="text-[11px] font-bold uppercase tracking-widest"
            style={{ color: "var(--n5)", fontFamily: "var(--font-saira), sans-serif" }}
          >
            Your squad — tap to transfer out
          </span>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{
              background: "var(--surf2)",
              color: "var(--n5)",
              border: "1.5px solid var(--n8)",
              fontFamily: "var(--font-saira), sans-serif",
            }}
          >
            {liveSquad.length} players
          </span>
        </div>

        <div
          className="mx-4 mb-4 overflow-hidden rounded-2xl"
          style={{ background: "var(--surf)", boxShadow: "var(--sh-sm)" }}
        >
          {liveSquad.map((sp, idx) => {
            const isOut = pendingOutIds.has(sp.player_id);
            const isPendingIn = pending.find((t) => t.playerOut.player_id === sp.player_id);
            const isFreeElim = sp.player.eliminated === true;

            return (
              <div
                key={sp.player_id}
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  borderBottom:
                    idx < liveSquad.length - 1 ? "1px solid rgba(14,23,38,.06)" : "none",
                  opacity: isFreeElim ? 0.65 : 1,
                }}
              >
                {/* Avatar */}
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{
                    background: POS_COLORS[sp.player.position],
                    fontFamily: "var(--font-saira), sans-serif",
                    textDecoration: isFreeElim ? "line-through" : "none",
                  }}
                >
                  {sp.player.name.slice(0, 2).toUpperCase()}
                </div>

                {/* Name + meta */}
                <div className="min-w-0 grow">
                  <div
                    className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold"
                    style={{
                      fontFamily: "var(--font-saira), sans-serif",
                      textDecoration: isFreeElim ? "line-through" : "none",
                      color: isFreeElim ? "var(--n5)" : "var(--n0)",
                    }}
                  >
                    {sp.player.name}
                  </div>
                  <div className="text-xs" style={{ color: "var(--n5)" }}>
                    {sp.player.flag_code ?? POS_LABELS[sp.player.position]} ·{" "}
                    {POS_LABELS[sp.player.position]} · {sp.player.current_price.toFixed(1)}
                  </div>
                </div>

                {/* Action */}
                {isFreeElim ? (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{
                      background: "var(--gbg)",
                      color: "var(--g1)",
                      border: "1.5px solid var(--g3)",
                      fontFamily: "var(--font-saira), sans-serif",
                      whiteSpace: "nowrap",
                    }}
                  >
                    free · elim
                  </span>
                ) : isOut ? (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                      style={{
                        background: "var(--rbg)",
                        color: "var(--r1)",
                        border: "1.5px solid var(--r2)",
                        fontFamily: "var(--font-saira), sans-serif",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => markOut(sp)}
                    >
                      ✕ cancel
                    </button>
                    {isPendingIn?.playerIn ? (
                      <button
                        className="text-[10px] font-semibold"
                        style={{
                          color: "var(--g2)",
                          fontFamily: "var(--font-saira), sans-serif",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onClick={() => openPicker(sp)}
                      >
                        → {isPendingIn.playerIn.name}
                      </button>
                    ) : (
                      <button
                        className="text-[10px] font-semibold"
                        style={{
                          color: "var(--n4)",
                          fontFamily: "var(--font-saira), sans-serif",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onClick={() => openPicker(sp)}
                      >
                        pick replacement →
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    className="inline-flex items-center rounded-[7px] px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide"
                    style={{
                      background: "var(--rbg)",
                      color: "var(--r1)",
                      border: "1.5px solid var(--r2)",
                      fontFamily: "var(--font-saira), sans-serif",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => markOut(sp)}
                  >
                    OUT →
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Eliminated note */}
        <p
          className="px-4 pb-4 text-center text-[12px]"
          style={{ color: "var(--n5)", fontFamily: "var(--font-saira), sans-serif" }}
        >
          Eliminated players receive an automatic free transfer — no cap cost.
        </p>

        {confirmSuccess && (
          <div
            className="mx-4 mb-4 rounded-xl px-4 py-3 text-sm font-semibold"
            style={{
              background: "var(--gbg)",
              color: "var(--g1)",
              border: "1.5px solid var(--g3)",
              fontFamily: "var(--font-saira), sans-serif",
            }}
          >
            Transfers confirmed successfully!
          </div>
        )}
        {confirmError && (
          <div
            className="mx-4 mb-4 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "var(--rbg)",
              color: "var(--r1)",
              fontFamily: "var(--font-saira), sans-serif",
            }}
          >
            {confirmError}
          </div>
        )}
      </div>

      {/* Transfer tray */}
      {pending.length > 0 && (
        <div
          className="shrink-0 px-4 py-3"
          style={{ background: "var(--surf)", boxShadow: "0 -3px 16px rgba(14,23,38,.1)" }}
        >
          <div className="mb-2 flex items-start justify-between">
            <div>
              <div
                className="text-[13px] font-bold uppercase tracking-wide"
                style={{ fontFamily: "var(--font-saira), sans-serif" }}
              >
                Transfer tray ({pending.length})
              </div>
              <div
                className="mt-0.5 text-[12px]"
                style={{ color: "var(--n5)", fontFamily: "var(--font-saira), sans-serif" }}
              >
                {pending.map((t, i) => (
                  <span key={t.playerOut.player_id}>
                    {i > 0 && " · "}
                    {t.playerOut.player.name} →{" "}
                    <strong style={{ color: "var(--n0)" }}>
                      {t.playerIn ? t.playerIn.name : "pick replacement"}
                    </strong>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="text-[12px]"
                style={{ color: "var(--n5)", fontFamily: "var(--font-saira), sans-serif" }}
              >
                Cap:
              </span>
              <span
                style={{
                  fontFamily: "var(--font-anton), sans-serif",
                  fontSize: 18,
                  color: projectedCap < liveCap ? "var(--r1)" : "var(--n0)",
                }}
              >
                {projectedCap.toFixed(0)}
              </span>
              <span
                className="text-[12px]"
                style={{ color: "var(--n5)", fontFamily: "var(--font-saira), sans-serif" }}
              >
                /{liveCap.toFixed(0)}
              </span>
            </div>
          </div>

          {!isWindowOpen && pendingCapCost > 0 && (
            <div
              className="mb-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
              style={{
                background: "var(--rbg)",
                color: "var(--r1)",
                fontFamily: "var(--font-saira), sans-serif",
                border: "1px solid var(--r2)",
              }}
            >
              −{pendingCapCost} cap per transfer (outside window)
            </div>
          )}

          <button
            className="w-full rounded-[9px] py-3 text-sm font-bold uppercase tracking-wide"
            style={{
              background: canConfirm && !confirming ? "var(--g3)" : "var(--n8)",
              color: canConfirm && !confirming ? "#063021" : "var(--n5)",
              fontFamily: "var(--font-saira), sans-serif",
              border: "none",
              cursor: canConfirm && !confirming ? "pointer" : "not-allowed",
              opacity: confirming ? 0.7 : 1,
            }}
            onClick={handleConfirm}
            disabled={!canConfirm || confirming}
          >
            {confirming
              ? "Confirming…"
              : !canConfirm
              ? `Pick ${pending.filter((t) => !t.playerIn).length} replacement(s)`
              : `Confirm ${pending.length} transfer${pending.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {/* Empty tray bottom bar */}
      {pending.length === 0 && (
        <div
          className="shrink-0 px-4 py-3"
          style={{ background: "var(--surf)", boxShadow: "0 -3px 16px rgba(14,23,38,.1)" }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-[13px] font-semibold"
              style={{ color: "var(--n5)", fontFamily: "var(--font-saira), sans-serif" }}
            >
              Cap: {liveCap.toFixed(0)} / 100
            </span>
            <span
              className="text-[12px]"
              style={{ color: "var(--n6)", fontFamily: "var(--font-saira), sans-serif" }}
            >
              Tap OUT → to make a transfer
            </span>
          </div>
        </div>
      )}

      {/* Player picker drawer */}
      {pickerOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,.45)" }}
            onClick={() => {
              setPickerOpen(false);
              setPickerTarget(null);
            }}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl"
            style={{ background: "var(--surf)", maxHeight: "75vh", boxShadow: "var(--sh-lg)" }}
          >
            <div className="flex justify-center pt-2">
              <div className="h-1 w-10 rounded-full" style={{ background: "var(--n8)" }} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <span
                  className="text-[15px] font-bold uppercase tracking-wide"
                  style={{ fontFamily: "var(--font-saira), sans-serif" }}
                >
                  Pick replacement
                </span>
                {pickerTarget && (
                  <div
                    className="text-[11px]"
                    style={{ color: "var(--n5)", fontFamily: "var(--font-saira), sans-serif" }}
                  >
                    replacing {pickerTarget.player.name} ·{" "}
                    {POS_LABELS[pickerTarget.player.position]}
                  </div>
                )}
              </div>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full text-xl"
                style={{ background: "var(--surf2)", color: "var(--n4)" }}
                onClick={() => {
                  setPickerOpen(false);
                  setPickerTarget(null);
                }}
              >
                ×
              </button>
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto px-4 pb-2">
              {(["all", "gk", "def", "mid", "fwd"] as const).map((f) => (
                <button
                  key={f}
                  className="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
                  style={{
                    background: pickerFilter === f ? "var(--n0)" : "var(--surf2)",
                    color: pickerFilter === f ? "#fff" : "var(--n5)",
                    fontFamily: "var(--font-saira), sans-serif",
                    border: "1.5px solid",
                    borderColor: pickerFilter === f ? "var(--n0)" : "var(--n8)",
                    cursor: "pointer",
                  }}
                  onClick={() => setPickerFilter(f)}
                >
                  {f === "all" ? "All" : POS_LABELS[f]}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="px-4 pb-2">
              <input
                type="text"
                placeholder="Search player…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{
                  borderColor: "var(--n8)",
                  background: "var(--surf2)",
                  fontFamily: "var(--font-inter), sans-serif",
                  color: "var(--n0)",
                }}
              />
            </div>

            {/* Player list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {pickerPlayers.length === 0 && (
                <p className="py-6 text-center text-sm" style={{ color: "var(--n6)" }}>
                  No players match
                </p>
              )}
              {pickerPlayers.map((player) => (
                <button
                  key={player.id}
                  className="flex w-full items-center gap-3 border-b py-2.5 text-left"
                  style={{
                    borderColor: "rgba(14,23,38,.06)",
                    cursor: "pointer",
                    background: "none",
                  }}
                  onClick={() => selectReplacement(player)}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                    style={{
                      background: POS_COLORS[player.position],
                      fontFamily: "var(--font-saira), sans-serif",
                    }}
                  >
                    {player.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 grow">
                    <div
                      className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold"
                      style={{ fontFamily: "var(--font-saira), sans-serif" }}
                    >
                      {player.name}
                    </div>
                    <div className="text-xs" style={{ color: "var(--n5)" }}>
                      {player.flag_code ?? ""} · {POS_LABELS[player.position]}
                    </div>
                  </div>
                  <span
                    className="shrink-0 text-sm font-bold"
                    style={{ fontFamily: "var(--font-anton), sans-serif" }}
                  >
                    {player.current_price.toFixed(1)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
