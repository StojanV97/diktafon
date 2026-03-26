import React from "react";
import { StyleSheet, View } from "react-native";
import { IconButton, Menu, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, radii, elevation, iconSize, typography } from "../../../theme";
import { t } from "../../i18n";
import type { Reminder } from "../../types/reminder";

interface Props {
  item: Reminder;
  isMenuOpen: boolean;
  onMenuOpen: (id: string) => void;
  onMenuClose: () => void;
  onMarkDone: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatReminderTime(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const time = `${hours}:${minutes}`;

  if (d.toDateString() === now.toDateString()) {
    return `${t("reminders.today")} ${time}`;
  }
  if (d.toDateString() === tomorrow.toDateString()) {
    return `${t("reminders.tomorrow")} ${time}`;
  }
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${day}.${month}. ${time}`;
}

function recurrenceLabel(item: Reminder): string {
  if (!item.recurrence) return t("reminders.once");
  const map: Record<string, string> = {
    daily: t("reminders.daily"),
    weekly: t("reminders.weekly"),
    monthly: t("reminders.monthly"),
  };
  return map[item.recurrence.type] || t("reminders.once");
}

function statusConfig(status: string) {
  switch (status) {
    case "pending":
      return { label: t("reminders.pending"), fg: colors.badgePendingFg, icon: "clock-outline" as const };
    case "snoozed":
      return { label: t("reminders.snoozed"), fg: colors.badgeSnoozedFg, icon: "alarm-snooze" as const };
    case "done":
      return { label: t("reminders.done"), fg: colors.badgeDoneFg, icon: "check-circle-outline" as const };
    default:
      return { label: status, fg: colors.muted, icon: "help-circle-outline" as const };
  }
}

function ReminderCard({
  item,
  isMenuOpen,
  onMenuOpen,
  onMenuClose,
  onMarkDone,
  onDelete,
}: Props) {
  const sc = statusConfig(item.status);

  return (
    <View style={[styles.card, elevation.sm]}>
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: sc.fg }]} />

      <View style={styles.cardContent}>
        {/* Top row: category label + menu */}
        <View style={styles.topRow}>
          <View style={styles.categoryRow}>
            <MaterialCommunityIcons name={sc.icon} size={iconSize.sm} color={sc.fg} style={{ marginRight: spacing.xs }} />
            <Text style={[styles.categoryLabel, { color: sc.fg }]}>{sc.label}</Text>
            <Text style={styles.metaText}>{formatReminderTime(item.reminder_time)}</Text>
            <View style={styles.recurrenceBadge}>
              <Text style={styles.recurrenceText}>{recurrenceLabel(item)}</Text>
            </View>
          </View>
          <Menu
            visible={isMenuOpen}
            onDismiss={onMenuClose}
            anchor={
              <IconButton
                icon="dots-vertical"
                iconColor={colors.muted}
                size={iconSize.md}
                onPress={() => onMenuOpen(item.id)}
                style={styles.menuBtn}
              />
            }
          >
            {item.status !== "done" && (
              <Menu.Item
                leadingIcon="check-circle-outline"
                onPress={() => onMarkDone(item.id)}
                title={t("reminders.markDone")}
              />
            )}
            <Menu.Item
              leadingIcon="delete-outline"
              onPress={() => onDelete(item.id)}
              title={t("reminders.delete")}
            />
          </Menu>
        </View>

        {/* Main content: action text */}
        <Text style={styles.actionText} numberOfLines={2}>{item.action}</Text>
      </View>
    </View>
  );
}

export default React.memo(ReminderCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  accentBar: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 2,
    marginLeft: spacing.md,
  },
  cardContent: {
    flex: 1,
    padding: spacing.lg,
    paddingLeft: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  categoryLabel: {
    ...typography.monoLabel,
    fontSize: 10,
    letterSpacing: 1,
  },
  metaText: {
    ...typography.mono,
    fontSize: 11,
  },
  menuBtn: {
    margin: -spacing.sm,
  },
  actionText: {
    ...typography.subheading,
    marginTop: spacing.sm,
  },
  recurrenceBadge: {
    backgroundColor: colors.badgeNeutral,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  recurrenceText: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    color: colors.muted,
  },
});
