import { colors } from "../theme"

export function statusConfig(status) {
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

export function groupByDate(entries) {
  const map = {}
  for (const e of entries) {
    const date = e.recorded_date || e.created_at.slice(0, 10)
    if (!map[date]) map[date] = []
    map[date].push(e)
  }
  return Object.keys(map)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({ date, data: map[date] }))
}
