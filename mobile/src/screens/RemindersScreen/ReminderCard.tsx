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
        <MaterialCommunityIcons name={sc.icon} size={14} color={sc.fg} style={{ marginRight: spacing.xs }} />
        <Text style={[styles.statusLabel, { color: sc.fg }]}>{sc.label}</Text>
        <Text style={styles.metaSeparator}> · </Text>
        <Text style={typography.caption}>{formatReminderTime(item.reminder_time)}</Text>
        <View style={styles.recurrenceBadge}>
          <Text style={styles.recurrenceText}>{recurrenceLabel(item)}</Text>
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
    borderLeftColor: colors.badgeDoneFg,
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
