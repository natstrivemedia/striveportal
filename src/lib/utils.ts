import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "3 posts" / "1 post" — used in headings and email subjects. */
export function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

const RELATIVE_STEPS: Array<[limit: number, divisor: number, unit: Intl.RelativeTimeFormatUnit]> = [
  [60, 1, "second"],
  [3600, 60, "minute"],
  [86400, 3600, "hour"],
  [604800, 86400, "day"],
  [2629800, 604800, "week"],
  [31557600, 2629800, "month"],
  [Infinity, 31557600, "year"],
];

/** "6h ago" style stamps — used to be honest about analytics freshness. */
export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });
  for (const [limit, divisor, unit] of RELATIVE_STEPS) {
    if (abs < limit) return fmt.format(Math.round(seconds / divisor), unit);
  }
  return date.toLocaleDateString();
}

export function formatDate(
  value: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
  timeZone?: string,
): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(date);
}

/**
 * Format a calendar month held as 'YYYY-MM-DD' (or a Date) without timezone
 * drift. `new Date("2026-07-01")` is parsed as UTC midnight, which renders as
 * "June 2026" anywhere west of Greenwich — so the parts are read directly
 * instead of going through a timezone conversion.
 */
export function formatMonth(value: string | Date | null | undefined): string {
  if (!value) return "";
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return String(value);
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

/** Parse a 'YYYY-MM-DD' month into a local Date at midnight. */
export function parseMonth(value: string | Date): Date {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), 1);
  const m = /^(\d{4})-(\d{2})/.exec(String(value));
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1000).toFixed(0)}K`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("en-US");
}

/** Readable contrast check so a client's brand colour never yields white-on-yellow. */
export function readableOn(hex: string): "#ffffff" | "#1c1917" {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? "#1c1917" : "#ffffff";
}
