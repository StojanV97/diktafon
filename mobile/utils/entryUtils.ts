import { colors } from "../theme"
import type { EntryStatus, StatusConfig } from "../src/types"
import { getRecordedDate } from "../src/utils/dateHelpers"
import type { Entry } from "../src/types"
import { t } from "../src/i18n"

export function statusConfig(status: EntryStatus | string): StatusConfig {
  switch (status) {
    case "recorded":
      return { label: t('entry.statusRecorded'), icon: "check", bg: colors.primaryLight, fg: colors.primary }
    case "processing":
      return { label: t('entry.statusProcessing'), icon: "progress-clock", bg: colors.warningLight, fg: colors.warning }
    case "error":
      return { label: t('entry.statusError'), icon: "alert-circle-outline", bg: colors.dangerLight, fg: colors.danger }
    default:
      return { label: t('entry.statusDone'), icon: "check-circle-outline", bg: colors.successLight, fg: colors.success }
  }
}

export function displayName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "")
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
