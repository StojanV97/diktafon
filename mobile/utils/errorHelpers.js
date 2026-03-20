const SAFE_PATTERNS = [
  "Prekoraceno vreme", "Proverite internet", "Pokusajte ponovo",
  "Neispravan", "Pogresna lozinka", "ostecen", "nedostaje",
  "nije preuzet", "nije uspelo", "nije dostupno", "nije pronadjen",
  "SAFETY_BACKUP_FAILED", "AUTH_REQUIRED",
]

export function safeErrorMessage(e, fallback = "Doslo je do greske. Pokusajte ponovo.") {
  if (e?.message && SAFE_PATTERNS.some(p => e.message.includes(p))) {
    return e.message
  }
  return fallback
}
