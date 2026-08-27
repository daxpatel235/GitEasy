/** Relative-time formatting, shared by every list that shows a timestamp. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** "just now", "4 hours ago", "3 days ago" — never a raw date for recent items. */
export function timeAgo(at: number): string {
  const diff = Date.now() - at;

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), "minute");
  if (diff < DAY) return plural(Math.floor(diff / HOUR), "hour");
  if (diff < WEEK) return plural(Math.floor(diff / DAY), "day");
  if (diff < 5 * WEEK) return plural(Math.floor(diff / WEEK), "week");

  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Compact form for dense rows: "4h", "3d". */
export function timeAgoShort(at: number): string {
  const diff = Date.now() - at;
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`;
  return `${Math.floor(diff / WEEK)}w`;
}

/** "4m 12s" for CI durations. */
export function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
