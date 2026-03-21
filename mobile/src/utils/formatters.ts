import { t } from "../i18n";

/**
 * Format seconds as "M:SS" (e.g., "2:05"). Returns "0:00" for falsy input.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format seconds as "M:SS" but return empty string for falsy input.
 * Used in directory listings where blank is preferred over "0:00".
 */
export function formatDurationCompact(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format seconds as "X min Y s" (e.g., "2 min 5 s"). Returns empty string for falsy input.
 */
export function formatDurationVerbose(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m} min ${s} s`;
}

/**
 * Format an ISO date string using sr-Latn-RS locale (e.g., "21. 3. 2026. 14:30:00").
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("sr-Latn-RS");
}

/**
 * Format an ISO date string as "HH:MM" (24h).
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Format seconds as "M:SS" for audio playback position. Returns "0:00" for invalid input.
 */
export function formatPlaybackTime(seconds: number | null | undefined): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format a date string for section headers (e.g., "Danas — 21. mart", "Juce — 20. mart", "19. mart").
 */
export function formatSectionDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const date = new Date(dateStr + "T00:00:00");
  const month = date.toLocaleString("sr-Latn-RS", { month: "long" });
  const day = date.getDate();
  if (dateStr === today) return `${t('calendar.today')} — ${day}. ${month}`;
  if (dateStr === yesterday) return `${t('calendar.yesterday')} — ${day}. ${month}`;
  return `${day}. ${month}`;
}

/**
 * Format milliseconds as "M:SS" for recording timer display.
 */
export function formatTimer(ms: number | null | undefined): string {
  const total = Math.floor((ms ?? 0) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
