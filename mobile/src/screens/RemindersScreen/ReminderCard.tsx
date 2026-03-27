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

const DAY_KEYS = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"];

function formatTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatReminderTime(item: Reminder): string {
  const d = new Date(item.reminder_time);
  const time = formatTime(d);

  if (item.recurrence) {
    const { type, days_of_week } = item.recurrence;

    if (type === "daily") return time;

    if (type === "weekly") {
      const days = days_of_week && days_of_week.length > 0
        ? days_of_week
        : [d.getDay()];
      const names = days.map((i) => t(`reminders.${DAY_KEYS[i]}`));
      return `${names.join(", ")} ${time}`;
    }

    if (type === "monthly") {
      return t("reminders.monthlyAt", { day: d.getDate(), time });
    }
  }

  // One-time: show date + time with today/tomorrow shortcuts
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === now.toDateString()) return `${t("reminders.today")} ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `${t("reminders.tomorrow")} ${time}`;

  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${day}.${month}. ${time}`;
}

function recurrenceConfig(item: Reminder) {
  if (!item.recurrence) {
    return { label: t("reminders.once"), fg: colors.muted, bg: colors.badgeNeutral };
  }
  switch (item.recurrence.type) {
    case "daily":
      return { label: t("reminders.daily"), fg: colors.primary, bg: colors.primaryLight };
    case "weekly":
      return { label: t("reminders.weekly"), fg: colors.warning, bg: colors.warningLight };
    case "monthly":
      return { label: t("reminders.monthly"), fg: colors.badgeDoneFg, bg: colors.badgeDone };
    default:
      return { label: t("reminders.once"), fg: colors.muted, bg: colors.badgeNeutral };
  }
}

function statusConfig(status: string) {
  switch (status) {
    case "pending":
      return { label: t("reminders.pending"), icon: "clock-outline" as const };
    case "notified":
      return { label: t("reminders.notified"), icon: "bell-ring-outline" as const };
    case "snoozed":
      return { label: t("reminders.snoozed"), icon: "alarm-snooze" as const };
    case "done":
      return { label: t("reminders.done"), icon: "check-circle-outline" as const };
    default:
      return { label: status, icon: "help-circle-outline" as const };
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
  const rc = recurrenceConfig(item);

  return (
    <View style={[styles.card, elevation.sm, { borderLeftColor: rc.fg }]}>
      <View style={styles.topRow}>
        <Text style={styles.actionText} numberOfLines={2}>{item.action.charAt(0).toUpperCase() + item.action.slice(1)}</Text>
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
      <View style={styles.metaRow}>
        <MaterialCommunityIcons name={sc.icon} size={14} color={colors.muted} style={{ marginRight: spacing.xs }} />
        <Text style={styles.statusLabel}>{sc.label}</Text>
        <Text style={styles.metaSeparator}> · </Text>
        <Text style={typography.caption}>{formatReminderTime(item)}</Text>
        <View style={[styles.recurrenceBadge, { backgroundColor: rc.bg }]}>
          <Text style={[styles.recurrenceText, { color: rc.fg }]}>{rc.label}</Text>
        </View>
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
    padding: spacing.lg,
    borderLeftWidth: 4,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionText: {
    ...typography.body,
    flex: 1,
  },
  menuBtn: {
    margin: -spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    gap: spacing.xs,
  },
  statusLabel: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  metaSeparator: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: colors.muted,
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
