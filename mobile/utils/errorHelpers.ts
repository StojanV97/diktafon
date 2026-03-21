import { t } from "../src/i18n";

const SAFE_PATTERNS = [
  "Prekoraceno vreme", "Proverite internet", "Pokusajte ponovo",
  "Neispravan", "Pogresna lozinka", "ostecen", "nedostaje",
  "nije preuzet", "nije uspelo", "nije dostupno", "nije pronadjen",
  "SAFETY_BACKUP_FAILED", "AUTH_REQUIRED",
]

export function safeErrorMessage(e: unknown, fallback = t('errors.generic')): string {
  const message = e instanceof Error ? e.message : typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : null
  if (message && SAFE_PATTERNS.some(p => message.includes(p))) {
    return message
  }
  return fallback
}
