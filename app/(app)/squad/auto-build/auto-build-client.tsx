"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FootballPlayer, PresetKey } from "@/lib/fantasy/types";
import { AUTO_BUILD_PRESETS } from "@/lib/fantasy/types";
import { buildSquad } from "@/lib/fantasy/solver";

interface Props {
  allPlayers: FootballPlayer[];
}

const POS_COLORS: Record<string, string> = {
  gk: "var(--pos-gk)",
  def: "var(--pos-def)",
  mid: "var(--pos-mid)",
  fwd: "var(--pos-fwd)",
};

const POS_LABELS: Record<string, string> = {
  gk: "GK",
  def: "DEF",
  mid: "MID",
  fwd: "FWD",
};

function PresetIcon({ presetKey }: { presetKey: PresetKey }) {
  switch (presetKey) {
    case "bignames":
      return (
        <svg width="18" height="17" viewBox="0 0 18 17" fill="currentColor" style={{ color: "var(--gold)" }}>
          <path d="M9 0l2.2 5.4H17l-4.6 3.3 1.8 5.6L9 11.2l-5.2 3 1.8-5.6L1 5.4h5.8z" />
        </svg>
      );
    case "underdogs":
      return (
        <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" style={{ color: "var(--n4)" }}>
          <path d="M8 0L1 10h5l-2 8 8-11H7z" />
        </svg>
      );
    case "mix":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--n4)" }}>
          <circle cx="9" cy="9" r="7" />
          <path d="M9 2v7l4 4" />
        </svg>
      );
    case "budget":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--n4)" }}>
          <path d="M9 1v16M5 4h6a3 3 0 010 6H5m0 3h7" />
        </svg>
      );
    case "form":
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: "var(--g3)" }}>
          <path d="M2 14l4-5 4 3 6-8" />
        </svg>
      );
  }
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 5l2.5 2.5 4.5-4.5" />
    </svg>
  );
}

export function AutoBuildClient({ allPlayers }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<PresetKey>("bignames");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedSquad, setGeneratedSquad] = useState<(FootballPlayer & { is_starting: boolean })[] | null>(null);

  const handleGenerate = () => {
    setGenerating(true);
    setError(null);

    // Run synchronously but wrap in setTimeout for UX
    setTimeout(() => {
      const result = buildSquad(allPlayers, selected);
      if (!result) {
        setError("Could not generate a valid squad. Please try a different preset.");
      } else {
        setGeneratedSquad(result);
      }
      setGenerating(false);
    }, 400);
  };

  const totalCost = generatedSquad
    ? generatedSquad.reduce((s, p) => s + p.current_price, 0)
    : 0;

  const starting = generatedSquad?.filter((p) => p.is_starting) ?? [];
  const bench = generatedSquad?.filter((p) => !p.is_starting) ?? [];

  const groupedStarting: Record<string, (FootballPlayer & { is_starting: boolean })[]> = {};
  for (const p of starting) {
    if (!groupedStarting[p.position]) groupedStarting[p.position] = [];
    groupedStarting[p.position].push(p);
  }

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg)" }}>
      {/* Page header */}
      <div
        className="flex h-[54px] shrink-0 items-center gap-3 px-4"
        style={{ background: "var(--surf)", borderBottom: "1px solid rgba(14,23,38,.08)" }}
      >
        <Link
          href="/squad"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: "var(--surf2)" }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M14 6L8 11l6 5" stroke="var(--n0)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="grow">
          <div
            style={{
              fontFamily: "var(--font-saira), sans-serif",
              fontWeight: 800,
              fontSize: 18,
              textTransform: "uppercase",
              letterSpacing: ".4px",
            }}
          >
            Auto-build
          </div>
          <div
            className="text-xs"
            style={{ color: "var(--n5)", fontFamily: "var(--font-inter), sans-serif" }}
          >
            SBC-style preset builder
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4">
          <div
            className="mb-1 text-[22px]"
            style={{ fontFamily: "var(--font-anton), sans-serif", textTransform: "uppercase" }}
          >
            Pick a playstyle
          </div>
          <div className="text-sm" style={{ color: "var(--n5)", fontFamily: "var(--font-inter), sans-serif" }}>
            We&apos;ll fill a legal 15 you can tweak. All presets respect max 3/nation and budget.
          </div>
        </div>

        {/* Preset grid */}
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          {AUTO_BUILD_PRESETS.slice(0, 4).map((preset) => (
            <button
              key={preset.key}
              className="relative rounded-2xl p-3.5 text-left"
              style={{
                background: selected === preset.key ? "#f0fff8" : "var(--surf)",
                border: `2px solid ${selected === preset.key ? "var(--g3)" : "transparent"}`,
                boxShadow: "var(--sh-sm)",
                cursor: "pointer",
              }}
              onClick={() => setSelected(preset.key)}
            >
              {selected === preset.key && (
                <div
                  className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ background: "var(--g3)" }}
                >
                  <CheckIcon />
                </div>
              )}
              <div
                className="flex h-[42px] w-[42px] items-center justify-center rounded-[11px]"
                style={{
                  background: selected === preset.key ? "rgba(0,184,92,.12)" : "var(--surf2)",
                }}
              >
                <PresetIcon presetKey={preset.key} />
              </div>
              <div className="mt-2.5">
                <div
                  className="text-[13px] font-bold"
                  style={{ color: "var(--n0)", fontFamily: "var(--font-saira), sans-serif" }}
                >
                  {preset.label}
                </div>
                <div
                  className="mt-0.5 text-[12px]"
                  style={{ color: "var(--n5)", fontFamily: "var(--font-inter), sans-serif" }}
                >
                  {preset.description}
                </div>
              </div>
              <div
                className="mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  background: selected === preset.key ? "var(--gbg)" : "transparent",
                  color: selected === preset.key ? "var(--g1)" : "var(--n5)",
                  border: `1.5px solid ${selected === preset.key ? "transparent" : "var(--n8)"}`,
                  fontFamily: "var(--font-saira), sans-serif",
                }}
              >
                {preset.stat}
              </div>
            </button>
          ))}
        </div>

        {AUTO_BUILD_PRESETS.slice(4).map((preset) => (
          <button
            key={preset.key}
            className="relative mb-2.5 w-full rounded-2xl p-3.5 text-left"
            style={{
              background: selected === preset.key ? "#f0fff8" : "var(--surf)",
              border: `2px solid ${selected === preset.key ? "var(--g3)" : "transparent"}`,
              boxShadow: "var(--sh-sm)",
              cursor: "pointer",
            }}
            onClick={() => setSelected(preset.key)}
          >
            {selected === preset.key && (
              <div
                className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full"
                style={{ background: "var(--g3)" }}
              >
                <CheckIcon />
              </div>
            )}
            <div className="flex items-center gap-3">
              <div
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px]"
                style={{
                  background: selected === preset.key ? "rgba(0,184,92,.12)" : "var(--surf2)",
                }}
              >
                <PresetIcon presetKey={preset.key} />
              </div>
              <div className="grow">
                <div
                  className="text-[13px] font-bold"
                  style={{ color: "var(--n0)", fontFamily: "var(--font-saira), sans-serif" }}
                >
                  {preset.label}
                </div>
                <div
                  className="mt-0.5 text-[12px]"
                  style={{ color: "var(--n5)", fontFamily: "var(--font-inter), sans-serif" }}
                >
                  {preset.description}
                </div>
              </div>
              <div
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  background: selected === preset.key ? "var(--gbg)" : "transparent",
                  color: selected === preset.key ? "var(--g1)" : "var(--n5)",
                  border: `1.5px solid ${selected === preset.key ? "transparent" : "var(--n8)"}`,
                  fontFamily: "var(--font-saira), sans-serif",
                }}
              >
                {preset.stat}
              </div>
            </div>
          </button>
        ))}

        {error && (
          <div
            className="mt-2 rounded-xl px-4 py-2 text-sm"
            style={{ background: "var(--rbg)", color: "var(--r1)" }}
          >
            {error}
          </div>
        )}

        {/* Generated squad preview */}
        {generatedSquad && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span
                className="text-[13px] font-bold uppercase tracking-wide"
                style={{ color: "var(--n5)", fontFamily: "var(--font-saira), sans-serif" }}
              >
                Generated squad
              </span>
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{
                  background: "var(--gbg)",
                  color: "var(--g1)",
                  fontFamily: "var(--font-saira), sans-serif",
                }}
              >
                {totalCost.toFixed(1)} / 100
              </span>
            </div>

            {/* Pitch preview */}
            <div
              className="relative overflow-hidden rounded-2xl"
              style={{
                height: 280,
                background:
                  "repeating-linear-gradient(var(--pitch-a),var(--pitch-a) 28px,var(--pitch-b) 28px,var(--pitch-b) 56px)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-evenly",
                padding: "10px 0",
              }}
            >
              <div
                className="pointer-events-none absolute left-4 right-4"
                style={{ top: "50%", borderTop: "1.5px solid rgba(255,255,255,.3)" }}
              />
              <div
                className="pointer-events-none absolute"
                style={{
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%,-50%)",
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,.35)",
                }}
              />

              {(["gk", "def", "mid", "fwd"] as const).map((pos) => {
                const posPlayers = groupedStarting[pos];
                if (!posPlayers || posPlayers.length === 0) return null;
                return (
                  <div key={pos} className="relative z-10 flex items-center justify-evenly">
                    {posPlayers.map((p) => (
                      <div key={p.id} className="flex flex-col items-center" style={{ gap: 2, width: 50 }}>
                        <div
                          style={{
                            width: 38,
                            height: 34,
                            borderRadius: "6px 6px 11px 11px",
                            background: POS_COLORS[pos],
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: "var(--font-saira), sans-serif",
                            fontWeight: 800,
                            fontSize: 10,
                            color: "#fff",
                            boxShadow: "0 2px 6px rgba(0,0,0,.3)",
                          }}
                        >
                          {p.flag_code || p.name.slice(0, 3).toUpperCase()}
                        </div>
                        <span
                          className="overflow-hidden text-ellipsis whitespace-nowrap text-center"
                          style={{
                            fontFamily: "var(--font-saira), sans-serif",
                            fontWeight: 700,
                            fontSize: 9,
                            color: "#fff",
                            textShadow: "0 1px 3px rgba(0,0,0,.5)",
                            maxWidth: 50,
                          }}
                        >
                          {p.name}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Bench */}
            <div
              className="mt-2 flex justify-evenly rounded-xl py-2.5"
              style={{ background: "var(--surf2)" }}
            >
              {bench.map((p) => (
                <div key={p.id} className="flex flex-col items-center" style={{ gap: 2, width: 50 }}>
                  <div
                    style={{
                      width: 36,
                      height: 32,
                      borderRadius: "6px 6px 10px 10px",
                      background: POS_COLORS[p.position],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-saira), sans-serif",
                      fontWeight: 800,
                      fontSize: 9,
                      color: "#fff",
                      boxShadow: "0 2px 4px rgba(0,0,0,.2)",
                      opacity: 0.8,
                    }}
                  >
                    {POS_LABELS[p.position]}
                  </div>
                  <span
                    className="overflow-hidden text-ellipsis whitespace-nowrap text-center"
                    style={{
                      fontFamily: "var(--font-saira), sans-serif",
                      fontWeight: 600,
                      fontSize: 8,
                      color: "var(--n5)",
                      maxWidth: 50,
                    }}
                  >
                    {p.name}
                  </span>
                </div>
              ))}
            </div>
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
            href="/squad"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-4 py-3 text-sm font-bold uppercase tracking-wide"
            style={{
              border: "2px solid rgba(14,23,38,.15)",
              color: "var(--n4)",
              fontFamily: "var(--font-saira), sans-serif",
              textDecoration: "none",
            }}
          >
            Build from scratch
          </Link>
          <button
            className="flex flex-1 items-center justify-center rounded-[9px] px-4 py-3 text-sm font-bold uppercase tracking-wide"
            style={{
              background: generating ? "var(--g2)" : "var(--g3)",
              color: "#063021",
              fontFamily: "var(--font-saira), sans-serif",
              opacity: generating ? 0.7 : 1,
              border: "none",
              cursor: generating ? "not-allowed" : "pointer",
            }}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? "Generating…" : "Generate squad →"}
          </button>
        </div>
      </div>
    </div>
  );
}
