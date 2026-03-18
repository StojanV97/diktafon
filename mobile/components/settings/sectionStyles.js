import { StyleSheet } from "react-native"
import { colors, spacing, radii, elevation } from "../../theme"

export const sectionStyles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
    ...elevation.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.foreground,
  },
  divider: { backgroundColor: colors.borderGhost },
  sectionBody: { padding: spacing.lg },
  btnRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btnColumn: {
    gap: spacing.sm,
  },
  btn: { borderRadius: radii.sm },
  progressBar: { height: 6, borderRadius: 3 },
  toggleRow: {
    marginTop: spacing.md,
  },
  toggleRowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
})
