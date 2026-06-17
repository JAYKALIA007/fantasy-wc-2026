"use client";

import { useState, useEffect } from "react";

interface CountdownProps {
  kickoffUtc: string;
  deadlineUtc?: string | null;
}

function compute(kickoffUtc: string, deadlineUtc?: string | null): string {
  const now = Date.now();
  const kickoffMs = new Date(kickoffUtc).getTime();

  if (kickoffMs <= now) {
    if (deadlineUtc) {
      const mins = Math.max(0, Math.ceil((new Date(deadlineUtc).getTime() - now) / 60000));
      return `⚡ ${mins}m left`;
    }
    return "In progress";
  }

  const totalMin = Math.floor((kickoffMs - now) / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export function Countdown({ kickoffUtc, deadlineUtc }: CountdownProps) {
  const [label, setLabel] = useState(() => compute(kickoffUtc, deadlineUtc));

  useEffect(() => {
    setLabel(compute(kickoffUtc, deadlineUtc));
    const interval = setInterval(
      () => setLabel(compute(kickoffUtc, deadlineUtc)),
      60_000
    );
    return () => clearInterval(interval);
  }, [kickoffUtc, deadlineUtc]);

  return <>{label}</>;
}
