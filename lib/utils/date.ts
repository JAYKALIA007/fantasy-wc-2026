const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function toISTDate(utcDate: string): Date {
  return new Date(new Date(utcDate).getTime() + IST_OFFSET_MS);
}

// "5 Jan · 14:30 IST"
export function toIST(utcDate: string): string {
  const ist = toISTDate(utcDate);
  const hh = ist.getUTCHours().toString().padStart(2, "0");
  const mm = ist.getUTCMinutes().toString().padStart(2, "0");
  return `${ist.getUTCDate()} ${MONTH_NAMES[ist.getUTCMonth()]} · ${hh}:${mm} IST`;
}

// "Mon 5 Jan · 14:30 IST" (includes weekday)
export function toISTWithDay(utcDate: string): string {
  const ist = toISTDate(utcDate);
  const hh = ist.getUTCHours().toString().padStart(2, "0");
  const mm = ist.getUTCMinutes().toString().padStart(2, "0");
  return `${DAY_NAMES[ist.getUTCDay()]} ${ist.getUTCDate()} ${MONTH_NAMES[ist.getUTCMonth()]} · ${hh}:${mm} IST`;
}

// "14:30 IST"
export function toISTTime(utcDate: string): string {
  const ist = toISTDate(utcDate);
  const hh = ist.getUTCHours().toString().padStart(2, "0");
  const mm = ist.getUTCMinutes().toString().padStart(2, "0");
  return `${hh}:${mm} IST`;
}

// "2026-06-18" in IST — used for grouping matches by day
export function getISTDateKey(utcDate: string): string {
  const ist = toISTDate(utcDate);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

// "Today" / "Tomorrow" / "Mon 5 Jun"
export function getDayLabel(utcDate: string): string {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const padDate = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const todayKey = padDate(nowIST);
  const tomorrowKey = padDate(new Date(nowIST.getTime() + 24 * 60 * 60 * 1000));
  const key = getISTDateKey(utcDate);
  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  const ist = toISTDate(utcDate);
  return `${DAY_NAMES[ist.getUTCDay()]} ${ist.getUTCDate()} ${MONTH_NAMES[ist.getUTCMonth()]}`;
}
