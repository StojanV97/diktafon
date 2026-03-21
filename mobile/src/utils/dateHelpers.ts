import type { Entry } from "../types";

/**
 * Get today's date as "YYYY-MM-DD".
 */
export function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get yesterday's date as "YYYY-MM-DD".
 */
export function getYesterday(): string {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

/**
 * Check if a "YYYY-MM-DD" date string is today.
 */
export function isToday(dateStr: string): boolean {
  return dateStr === getToday();
}

/**
 * Check if a "YYYY-MM-DD" date string is yesterday.
 */
export function isYesterday(dateStr: string): boolean {
  return dateStr === getYesterday();
}

/**
 * Extract the recorded date from an entry. Uses `recorded_date` if present,
 * otherwise falls back to the date portion of `created_at`.
 *
 * This pattern is used 12+ times across the codebase.
 */
export function getRecordedDate(entry: Pick<Entry, "recorded_date" | "created_at">): string {
  return entry.recorded_date || entry.created_at.slice(0, 10);
}
