// Display formatting. Durations follow the backend's convention ("2d 4h", "3h 12m", "45s").

export type TimeDisplay = "local" | "utc";

const COUNT = new Intl.NumberFormat("en-US");
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function missing(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

export function formatCount(value: number | null | undefined): string {
  return missing(value) ? "—" : COUNT.format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (missing(value)) return "—";
  return Math.abs(value) < 10_000 ? COUNT.format(value) : COMPACT.format(value);
}

export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  return missing(value) ? "—" : `${value.toFixed(fractionDigits)}%`;
}

export function formatDecimal(value: number | null | undefined, fractionDigits = 2): string {
  return missing(value) ? "—" : value.toFixed(fractionDigits);
}

export function formatDuration(ms: number | null | undefined): string {
  if (missing(ms)) return "—";
  const abs = Math.abs(ms);
  let text: string;
  if (abs < 1_000) {
    text = `${Math.round(abs)} ms`;
  } else if (abs < 60_000) {
    text = `${Math.floor(abs / 1_000)}s`;
  } else if (abs < 3_600_000) {
    const minutes = Math.floor(abs / 60_000);
    const seconds = Math.floor((abs % 60_000) / 1_000);
    text = seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  } else if (abs < 86_400_000) {
    const hours = Math.floor(abs / 3_600_000);
    const minutes = Math.floor((abs % 3_600_000) / 60_000);
    text = minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  } else {
    const days = Math.floor(abs / 86_400_000);
    const hours = Math.floor((abs % 86_400_000) / 3_600_000);
    text = hours ? `${days}d ${hours}h` : `${days}d`;
  }
  return ms < 0 ? `−${text}` : text;
}

function dateFormat(options: Intl.DateTimeFormatOptions, display: TimeDisplay): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", { hour12: false, ...options, ...(display === "utc" ? { timeZone: "UTC" } : {}) });
}

function toDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** "Sep 14, 09:21" (local) or "Sep 14, 09:21 UTC". */
export function formatDateTime(iso: string | null | undefined, display: TimeDisplay = "local"): string {
  const date = toDate(iso);
  if (!date) return iso ?? "—";
  const text = dateFormat({ month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }, display).format(date);
  return display === "utc" ? `${text} UTC` : text;
}

/** "Sep 14, 2026". */
export function formatDate(iso: string | null | undefined, display: TimeDisplay = "local"): string {
  const date = toDate(iso);
  return date ? dateFormat({ month: "short", day: "numeric", year: "numeric" }, display).format(date) : (iso ?? "—");
}

/** "09:21:05". */
export function formatTime(iso: string | null | undefined, display: TimeDisplay = "local"): string {
  const date = toDate(iso);
  return date ? dateFormat({ hour: "2-digit", minute: "2-digit", second: "2-digit" }, display).format(date) : (iso ?? "—");
}

const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** Parses the ISO-8601 durations Java's Duration accepts (days, hours, minutes, seconds). */
export function parseIsoDuration(value: string): number | null {
  const text = value.trim().toUpperCase();
  const match = ISO_DURATION.exec(text);
  if (!match || text === "P" || text.endsWith("T")) return null;
  const [, days, hours, minutes, seconds] = match;
  return (Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3_600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)) * 1_000;
}

export function isPositiveIsoDuration(value: string): boolean {
  const ms = parseIsoDuration(value);
  return ms !== null && ms > 0;
}

export function shortId(id: string, length = 8): string {
  return id.length > length ? id.slice(0, length) : id;
}

export function variantLabel(rank: number | undefined, variantId: string): string {
  return rank === undefined ? shortId(variantId) : `V${rank}`;
}
