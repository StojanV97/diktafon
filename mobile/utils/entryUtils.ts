import { colors } from "../theme"
import type { EntryStatus, StatusConfig } from "../src/types"
import { getRecordedDate } from "../src/utils/dateHelpers"
import type { Entry } from "../src/types"

export function statusConfig(status: EntryStatus | string): StatusConfig {
  switch (status) {
    case "recorded":
      return { label: "Snimljeno", icon: "check", bg: colors.primaryLight, fg: colors.primary }
    case "processing":
      return { label: "Transkribuje...", icon: "progress-clock", bg: colors.warningLight, fg: colors.warning }
    case "error":
      return { label: "Greska", icon: "alert-circle-outline", bg: colors.dangerLight, fg: colors.danger }
    default:
      return { label: "Gotovo", icon: "check-circle-outline", bg: colors.successLight, fg: colors.success }
  }
}

export function groupByDate(entries: Pick<Entry, "recorded_date" | "created_at">[]) {
  const map: Record<string, typeof entries> = {}
  for (const e of entries) {
    const date = getRecordedDate(e)
    if (!map[date]) map[date] = []
    map[date].push(e)
  }
  return Object.keys(map)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({ date, data: map[date] }))
}
