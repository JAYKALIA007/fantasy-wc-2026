"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import type { FootballPlayer, Position } from "@/lib/fantasy/types";
import { SQUAD_CONSTRAINTS } from "@/lib/fantasy/types";

interface SquadSlotData {
  player: FootballPlayer | null;
  is_starting: boolean;
  is_captain: boolean;
  is_vice_captain: boolean;
  slotIndex: number;
  position: Position;
}

export interface ExistingSquadPlayer {
  player_id: number;
  is_starting: boolean;
  is_captain: boolean;
  is_vice_captain: boolean;
  player: FootballPlayer;
}

interface Props {
  allPlayers: FootballPlayer[];
  existingSquadPlayers: ExistingSquadPlayer[];
  leagueId: string;
  hasSquad?: boolean;
}

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

// Default starting layout: 1 GK, 4 DEF, 4 MID, 2 FWD (4-4-2)
const START_LAYOUT: { pos: Position; count: number }[] = [
  { pos: "gk", count: 1 },
  { pos: "def", count: 4 },
  { pos: "mid", count: 4 },
  { pos: "fwd", count: 2 },
];

const BENCH_LAYOUT: Position[] = ["gk", "def", "mid", "fwd"];

function buildEmptySlots(): SquadSlotData[] {
  const slots: SquadSlotData[] = [];
  for (const { pos, count } of START_LAYOUT) {
    for (let i = 0; i < count; i++) {
      slots.push({ player: null, is_starting: true, is_captain: false, is_vice_captain: false, slotIndex: i, position: pos });
    }
  }
  for (let i = 0; i < BENCH_LAYOUT.length; i++) {
    slots.push({ player: null, is_starting: false, is_captain: false, is_vice_captain: false, slotIndex: i, position: BENCH_LAYOUT[i] });
  }
  return slots;
}

function initSlots(existing: ExistingSquadPlayer[]): SquadSlotData[] {
  const slots = buildEmptySlots();
  if (existing.length === 0) return slots;

  for (const slot of slots) {
    const posPlayersForSlot = existing.filter(
      (e) => e.is_starting === slot.is_starting && e.player.position === slot.position
    );
    const ep = posPlayersForSlot[slot.slotIndex];
    if (ep) {
      slot.player = ep.player;
      slot.is_captain = ep.is_captain;
      slot.is_vice_captain = ep.is_vice_captain;
    }
  }
  return slots;
}

export function SquadBuilder({ allPlayers, existingSquadPlayers, leagueId, hasSquad = false }: Props) {
  const [slots, setSlots] = useState<SquadSlotData[]>(() => initSlots(existingSquadPlayers));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null);
  const [pickerFilter, setPickerFilter] = useState<Position | "all">("all");
  const [pickerSearch, setPickerSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [captainMode, setCaptainMode] = useState(false);
  const [captainTarget, setCaptainTarget] = useState<"captain" | "vice_captain">("captain");

  const filledPlayers = useMemo(() => slots.filter((s) => s.player !== null), [slots]);

  const totalCost = useMemo(
    () => filledPlayers.reduce((sum, s) => sum + (s.player?.current_price ?? 0), 0),
    [filledPlayers]
  );

  const usedPlayerIds = useMemo(() => new Set(slots.map((s) => s.player?.id).filter((id): id is number => id !== undefined)), [slots]);

  const nationCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of slots) {
      if (s.player) counts.set(s.player.nation_id, (counts.get(s.player.nation_id) ?? 0) + 1);
    }
    return counts;
  }, [slots]);

  const nationViolation = useMemo(
    () => [...nationCounts.values()].some((c) => c > SQUAD_CONSTRAINTS.maxPerNation),
    [nationCounts]
  );

  const budgetPct = Math.min(100, (totalCost / SQUAD_CONSTRAINTS.valueCap) * 100);
  const budgetWarning = budgetPct > 90 && totalCost <= SQUAD_CONSTRAINTS.valueCap;
  const budgetOver = totalCost > SQUAD_CONSTRAINTS.valueCap;

  const formation = useMemo(() => {
    const starting = slots.filter((s) => s.is_starting && s.player);
    const defs = starting.filter((s) => s.position === "def").length;
    const mids = starting.filter((s) => s.position === "mid").length;
    const fwds = starting.filter((s) => s.position === "fwd").length;
    if (defs + mids + fwds === 10) return `${defs}-${mids}-${fwds}`;
    return "—";
  }, [slots]);

  const openPicker = useCallback(
    (slotIdx: number) => {
      const slot = slots[slotIdx];
      setActiveSlotIdx(slotIdx);
      setPickerFilter(slot.position);
      setPickerSearch("");
      setPickerOpen(true);
    },
    [slots]
  );

  const selectPlayer = useCallback(
    (player: FootballPlayer) => {
      if (activeSlotIdx === null) return;

      const currentSlotPlayer = slots[activeSlotIdx].player;
      const tempCounts = new Map(nationCounts);
      if (currentSlotPlayer) {
        const prev = tempCounts.get(currentSlotPlayer.nation_id) ?? 1;
        tempCounts.set(currentSlotPlayer.nation_id, Math.max(0, prev - 1));
      }
      const afterAdd = (tempCounts.get(player.nation_id) ?? 0) + 1;
      if (afterAdd > SQUAD_CONSTRAINTS.maxPerNation) return;

      setSlots((prev) =>
        prev.map((s, i) =>
          i === activeSlotIdx ? { ...s, player, is_captain: false, is_vice_captain: false } : s
        )
      );
      setPickerOpen(false);
      setActiveSlotIdx(null);
    },
    [activeSlotIdx, slots, nationCounts]
  );

  const removePlayer = useCallback((slotIdx: number) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === slotIdx ? { ...s, player: null, is_captain: false, is_vice_captain: false } : s))
    );
  }, []);

  const assignCaptaincy = useCallback(
    (slotIdx: number) => {
      if (!captainMode) return;
      const slot = slots[slotIdx];
      if (!slot.player || !slot.is_starting) return;
      setSlots((prev) =>
        prev.map((s, i) => {
          if (captainTarget === "captain") {
            return { ...s, is_captain: i === slotIdx };
          } else {
            return { ...s, is_vice_captain: i === slotIdx };
          }
        })
      );
      setCaptainMode(false);
    },
    [captainMode, captainTarget, slots]
  );

  const handleKitTap = useCallback(
    (slotIdx: number) => {
      if (captainMode) {
        assignCaptaincy(slotIdx);
      } else {
        openPicker(slotIdx);
      }
    },
    [captainMode, assignCaptaincy, openPicker]
  );

  const pickerPlayers = useMemo(() => {
    const currentSlotPlayerId = activeSlotIdx !== null ? slots[activeSlotIdx]?.player?.id : undefined;
    return allPlayers.filter((p) => {
      if (usedPlayerIds.has(p.id) && p.id !== currentSlotPlayerId) return false;
      if (pickerFilter !== "all" && p.position !== pickerFilter) return false;
      if (pickerSearch && !p.name.toLowerCase().includes(pickerSearch.toLowerCase())) return false;
      return true;
    });
  }, [allPlayers, usedPlayerIds, pickerFilter, pickerSearch, activeSlotIdx, slots]);

  const handleSave = useCallback(async () => {
    setSaveSuccess(false);
    if (filledPlayers.length !== 15) {
      setSaveError("Fill all 15 player slots before saving.");
      return;
    }
    if (!leagueId) {
      setSaveError("You need to join a league first.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        league_id: leagueId,
        players: slots
          .filter((s) => s.player !== null)
          .map((s) => ({
            player_id: s.player!.id,
            is_starting: s.is_starting,
            is_captain: s.is_captain,
            is_vice_captain: s.is_vice_captain,
          })),
      };
      const res = await fetch("/api/fantasy/squad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string; success?: boolean };
      if (!res.ok) {
        setSaveError(json.error ?? "Failed to save squad.");
      } else {
        setSaveSuccess(true);
      }
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [slots, filledPlayers.length, leagueId]);

  const startingByPos = useMemo(() => {
    const rows: { pos: Position; slotIndices: number[] }[] = [];
    const positions: Position[] = ["gk", "def", "mid", "fwd"];
    for (const pos of positions) {
      const indices = slots
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.is_starting && s.position === pos)
        .map(({ i }) => i);
      if (indices.length > 0) rows.push({ pos, slotIndices: indices });
    }
    return rows;
  }, [slots]);

  const benchIndices = useMemo(
    () =>
      slots
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => !s.is_starting)
        .map(({ i }) => i),
    [slots]
  );

  const captain = slots.find((s) => s.is_captain);
  const vc = slots.find((s) => s.is_vice_captain);

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg)" }}>
      {/* Page header */}
      <div
        className="flex h-[54px] shrink-0 items-center gap-2 px-4"
        style={{ background: "var(--surf)", borderBottom: "1px solid rgba(14,23,38,.08)" }}
      >
        <Link
          href="/"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: "var(--surf2)" }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M14 6L8 11l6 5" stroke="var(--n0)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <span
          className="grow"
          style={{
            fontFamily: "var(--font-saira), sans-serif",
            fontWeight: 800,
            fontSize: 18,
            textTransform: "uppercase",
            letterSpacing: ".4px",
          }}
        >
          Squad
        </span>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
          style={{ background: "var(--n3)", color: "#fff", fontFamily: "var(--font-saira), sans-serif" }}
        >
          {formation}
        </span>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{
            background: nationViolation ? "var(--rbg)" : "var(--gbg)",
            color: nationViolation ? "var(--r1)" : "var(--g1)",
            border: `1.5px solid ${nationViolation ? "var(--r2)" : "transparent"}`,
            fontFamily: "var(--font-saira), sans-serif",
          }}
        >
          3/nation {nationViolation ? "⚠" : "✓"}
        </span>
      </div>

      {/* Budget bar */}
      <div
        className="shrink-0 px-4 py-2.5"
        style={{ background: "var(--surf)", borderBottom: "1px solid rgba(14,23,38,.07)" }}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 700,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: ".4px",
            }}
          >
            Squad value
          </span>
          <span style={{ fontFamily: "var(--font-anton), sans-serif", fontSize: 18 }}>
            {totalCost.toFixed(1)}{" "}
            <span
              style={{
                fontSize: 13,
                fontFamily: "var(--font-inter), sans-serif",
                fontWeight: 500,
                color: "var(--n5)",
              }}
            >
              /{SQUAD_CONSTRAINTS.valueCap}
            </span>
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--n8)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${budgetPct}%`,
              background: budgetOver ? "var(--r2)" : budgetWarning ? "var(--gold)" : "var(--g3)",
            }}
          />
        </div>
      </div>

      {/* Scrollable main body */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-2" style={{ paddingTop: 10 }}>
        {/* Captain mode banner */}
        {captainMode && (
          <div
            className="mb-2 rounded-xl px-4 py-2 text-center text-sm font-semibold"
            style={{
              background: "var(--gold-bg)",
              color: "var(--gold-text)",
              border: "1.5px solid var(--gold)",
              fontFamily: "var(--font-saira), sans-serif",
            }}
          >
            Tap a starting player to assign {captainTarget === "captain" ? "Captain (C)" : "Vice-captain (V)"}
          </div>
        )}

        {/* Captain / VC info cards */}
        <div className="mb-2 flex gap-2.5 px-1">
          <button
            className="flex grow cursor-pointer flex-col rounded-2xl p-3 text-left"
            style={{
              background: "var(--surf)",
              border: "2px solid var(--gold)",
              boxShadow: "var(--sh-sm)",
            }}
            onClick={() => {
              setCaptainTarget("captain");
              setCaptainMode(true);
            }}
          >
            <span
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--gold-text)", fontFamily: "var(--font-saira), sans-serif" }}
            >
              Captain ×2
            </span>
            {captain?.player ? (
              <div className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{
                    background: POS_COLORS[captain.player.position],
                    fontFamily: "var(--font-saira), sans-serif",
                  }}
                >
                  {captain.player.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div
                    className="text-sm font-bold"
                    style={{ fontFamily: "var(--font-saira), sans-serif" }}
                  >
                    {captain.player.name}
                  </div>
                  <div className="text-xs" style={{ color: "var(--n5)" }}>
                    {captain.player.flag_code}
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-xs" style={{ color: "var(--n6)" }}>
                Tap to assign
              </span>
            )}
          </button>

          <button
            className="flex grow cursor-pointer flex-col rounded-2xl p-3 text-left"
            style={{ background: "var(--surf)", boxShadow: "var(--sh-sm)" }}
            onClick={() => {
              setCaptainTarget("vice_captain");
              setCaptainMode(true);
            }}
          >
            <span
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--n5)", fontFamily: "var(--font-saira), sans-serif" }}
            >
              Vice ×2*
            </span>
            {vc?.player ? (
              <div className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{
                    background: POS_COLORS[vc.player.position],
                    fontFamily: "var(--font-saira), sans-serif",
                  }}
                >
                  {vc.player.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div
                    className="text-sm font-bold"
                    style={{ fontFamily: "var(--font-saira), sans-serif" }}
                  >
                    {vc.player.name}
                  </div>
                  <div className="text-xs" style={{ color: "var(--n5)" }}>
                    {vc.player.flag_code}
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-xs" style={{ color: "var(--n6)" }}>
                Tap to assign
              </span>
            )}
          </button>
        </div>

        {/* Pitch */}
        <div
          className="relative flex shrink-0 flex-col overflow-hidden rounded-2xl"
          style={{
            height: 340,
            background:
              "repeating-linear-gradient(var(--pitch-a),var(--pitch-a) 28px,var(--pitch-b) 28px,var(--pitch-b) 56px)",
            justifyContent: "space-evenly",
            padding: "12px 0",
          }}
        >
          {/* Halfway line */}
          <div
            className="pointer-events-none absolute left-4 right-4"
            style={{ top: "50%", borderTop: "1.5px solid rgba(255,255,255,.3)" }}
          />
          {/* Centre circle */}
          <div
            className="pointer-events-none absolute"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: 76,
              height: 76,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,.35)",
            }}
          />

          {startingByPos.map(({ pos, slotIndices }) => (
            <div key={pos} className="relative z-10 flex items-center justify-evenly">
              {slotIndices.map((idx) => (
                <KitSlot
                  key={idx}
                  slot={slots[idx]}
                  onTap={() => handleKitTap(idx)}
                  onLongPress={() => removePlayer(idx)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Bench */}
        <div className="mt-2 px-1">
          <div className="mb-2 flex items-center justify-between">
            <span
              className="text-[12px] font-bold uppercase tracking-wider"
              style={{ color: "var(--n5)", fontFamily: "var(--font-saira), sans-serif" }}
            >
              Bench (4)
            </span>
            <span
              className="text-[12px]"
              style={{ color: "var(--n6)", fontFamily: "var(--font-inter), sans-serif" }}
            >
              hold to remove
            </span>
          </div>
          <div
            className="flex items-center justify-evenly rounded-xl py-2.5"
            style={{ background: "var(--surf2)" }}
          >
            {benchIndices.map((idx) => (
              <KitSlot
                key={idx}
                slot={slots[idx]}
                onTap={() => handleKitTap(idx)}
                onLongPress={() => removePlayer(idx)}
                small
              />
            ))}
          </div>
        </div>

        {saveError && (
          <div
            className="mx-1 mt-2 rounded-xl px-4 py-2 text-sm"
            style={{
              background: "var(--rbg)",
              color: "var(--r1)",
              fontFamily: "var(--font-saira), sans-serif",
            }}
          >
            {saveError}
          </div>
        )}
        {saveSuccess && (
          <div
            className="mx-1 mt-2 rounded-xl px-4 py-2 text-sm"
            style={{
              background: "var(--gbg)",
              color: "var(--g1)",
              fontFamily: "var(--font-saira), sans-serif",
            }}
          >
            Squad saved successfully!
          </div>
        )}
      </div>

      {/* Bottom tray */}
      <div
        className="shrink-0 px-4 py-2.5"
        style={{ background: "var(--surf)", boxShadow: "0 -3px 16px rgba(14,23,38,.1)" }}
      >
        <div className="flex gap-2">
          <Link
            href="/squad/auto-build"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-4 py-3 text-sm font-bold uppercase tracking-wide"
            style={{
              border: "2px solid rgba(14,23,38,.15)",
              color: "var(--n4)",
              fontFamily: "var(--font-saira), sans-serif",
              textDecoration: "none",
            }}
          >
            ✨ Auto-build
          </Link>
          <button
            className="flex flex-1 items-center justify-center rounded-[9px] px-4 py-3 text-sm font-bold uppercase tracking-wide"
            style={{
              background: saving ? "var(--g2)" : "var(--g3)",
              color: "#063021",
              fontFamily: "var(--font-saira), sans-serif",
              opacity: saving ? 0.7 : 1,
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
            }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save squad"}
          </button>
        </div>
        {hasSquad && (
          <Link
            href="/squad/transfers"
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-[9px] px-4 py-2.5 text-sm font-bold uppercase tracking-wide"
            style={{
              background: "var(--surf2)",
              color: "var(--n3)",
              border: "1.5px solid var(--n8)",
              fontFamily: "var(--font-saira), sans-serif",
              textDecoration: "none",
            }}
          >
            ⇄ Transfers
          </Link>
        )}
      </div>

      {/* Player picker drawer */}
      {pickerOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,.45)" }}
            onClick={() => setPickerOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl"
            style={{ background: "var(--surf)", maxHeight: "75vh", boxShadow: "var(--sh-lg)" }}
          >
            {/* Drawer handle */}
            <div className="flex justify-center pt-2">
              <div className="h-1 w-10 rounded-full" style={{ background: "var(--n8)" }} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span
                className="text-[15px] font-bold uppercase tracking-wide"
                style={{ fontFamily: "var(--font-saira), sans-serif" }}
              >
                Pick player
              </span>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full text-xl"
                style={{ background: "var(--surf2)", color: "var(--n4)" }}
                onClick={() => setPickerOpen(false)}
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
              {pickerPlayers.map((player) => {
                const currentSlotNationId = activeSlotIdx !== null ? slots[activeSlotIdx]?.player?.nation_id : undefined;
                const adjustedNationCount =
                  (nationCounts.get(player.nation_id) ?? 0) -
                  (currentSlotNationId === player.nation_id ? 1 : 0);
                const nationFull = adjustedNationCount >= SQUAD_CONSTRAINTS.maxPerNation;
                const inSquad =
                  usedPlayerIds.has(player.id) &&
                  (activeSlotIdx === null || slots[activeSlotIdx]?.player?.id !== player.id);
                const disabled = nationFull || inSquad;

                return (
                  <button
                    key={player.id}
                    className="flex w-full items-center gap-3 border-b py-2.5 text-left"
                    style={{
                      borderColor: "rgba(14,23,38,.06)",
                      opacity: disabled ? 0.4 : 1,
                      cursor: disabled ? "not-allowed" : "pointer",
                      background: "none",
                    }}
                    onClick={() => !disabled && selectPlayer(player)}
                    disabled={disabled}
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
                        {player.flag_code} · {POS_LABELS[player.position]}
                        {nationFull ? " · nation full" : ""}
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-sm font-bold"
                      style={{ fontFamily: "var(--font-anton), sans-serif" }}
                    >
                      {player.current_price.toFixed(1)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface KitSlotProps {
  slot: SquadSlotData;
  onTap: () => void;
  onLongPress: () => void;
  small?: boolean;
}

function KitSlot({ slot, onTap, onLongPress, small = false }: KitSlotProps) {
  const kitW = small ? 40 : 46;
  const kitH = small ? 36 : 42;
  const fontSize = small ? 10 : 12;
  const nameSize = small ? 10 : 11;
  const priceSize = small ? 9 : 10;

  let pressTimer: ReturnType<typeof setTimeout> | null = null;

  const handlePointerDown = () => {
    pressTimer = setTimeout(() => {
      onLongPress();
    }, 600);
  };

  const handlePointerUp = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  const player = slot.player;

  return (
    <div
      className="flex flex-col items-center"
      style={{ gap: 3, width: small ? 52 : 58 }}
    >
      <div
        style={{
          width: kitW,
          height: kitH,
          borderRadius: "7px 7px 13px 13px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-saira), sans-serif",
          fontWeight: 800,
          fontSize,
          color: "#fff",
          position: "relative",
          boxShadow: player ? "0 2px 6px rgba(0,0,0,.3)" : "none",
          background: player ? POS_COLORS[slot.position] : "rgba(255,255,255,.18)",
          border: player ? "none" : "2px dashed rgba(255,255,255,.4)",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={onTap}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {player ? (
          <>
            <span style={{ fontSize }}>
              {player.flag_code || player.name.slice(0, 3).toUpperCase()}
            </span>
            {slot.is_captain && <CaptainBadge />}
            {slot.is_vice_captain && !slot.is_captain && <VCBadge />}
          </>
        ) : (
          <span style={{ fontSize: 18, opacity: 0.7 }}>+</span>
        )}
      </div>
      <span
        className="overflow-hidden text-ellipsis whitespace-nowrap text-center"
        style={{
          fontFamily: "var(--font-saira), sans-serif",
          fontWeight: 700,
          fontSize: nameSize,
          color: "#fff",
          textShadow: "0 1px 3px rgba(0,0,0,.5)",
          maxWidth: small ? 52 : 58,
        }}
      >
        {player ? player.name : "—"}
      </span>
      <span
        style={{
          fontFamily: "var(--font-saira), sans-serif",
          fontWeight: 600,
          fontSize: priceSize,
          color: "rgba(255,255,255,.7)",
        }}
      >
        {player ? player.current_price.toFixed(1) : ""}
      </span>
    </div>
  );
}

function CaptainBadge() {
  return (
    <div
      style={{
        position: "absolute",
        top: -8,
        right: -8,
        width: 19,
        height: 19,
        borderRadius: "50%",
        background: "var(--gold)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-saira), sans-serif",
        fontWeight: 800,
        fontSize: 9,
        color: "#06301a",
        border: "2px solid #fff",
        zIndex: 2,
      }}
    >
      C
    </div>
  );
}

function VCBadge() {
  return (
    <div
      style={{
        position: "absolute",
        top: -8,
        right: -8,
        width: 19,
        height: 19,
        borderRadius: "50%",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-saira), sans-serif",
        fontWeight: 800,
        fontSize: 9,
        color: "var(--n0)",
        border: "2px solid var(--n8)",
        zIndex: 2,
      }}
    >
      V
    </div>
  );
}
