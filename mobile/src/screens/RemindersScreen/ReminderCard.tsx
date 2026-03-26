import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
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
      return { label: t("reminders.pending"), bg: colors.badgePending, fg: colors.badgePendingFg, icon: "clock-outline" };
    case "snoozed":
      return { label: t("reminders.snoozed"), bg: colors.badgeSnoozed, fg: colors.badgeSnoozedFg, icon: "alarm-snooze" };
    case "done":
      return { label: t("reminders.done"), bg: colors.badgeDone, fg: colors.badgeDoneFg, icon: "check-circle-outline" };
    default:
      return { label: status, bg: colors.badgeNeutral, fg: colors.muted, icon: "help-circle-outline" };
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
      <View style={styles.cardRow}>
        <View style={styles.cardLeft}>
          <MaterialCommunityIcons
            name="bell-outline"
            size={iconSize.md}
            color={colors.primary}
          />
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.actionText} numberOfLines={2}>
            {item.action}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.timeText}>
              {formatReminderTime(item.reminder_time)}
            </Text>
            <View style={[styles.badge, { backgroundColor: sc.bg }]}>
              <MaterialCommunityIcons
                name={sc.icon as any}
                size={iconSize.xs}
                color={sc.fg}
                style={{ marginRight: spacing.xs }}
              />
              <Text style={[styles.badgeText, { color: sc.fg }]}>
                {sc.label}
              </Text>
            </View>
            <View style={styles.recurrenceBadge}>
              <Text style={styles.recurrenceText}>{recurrenceLabel(item)}</Text>
            </View>
          </View>
        </View>

        <Menu
          visible={isMenuOpen}
          onDismiss={onMenuClose}
          anchor={
            <IconButton
              icon="dots-vertical"
              iconColor={colors.muted}
              size={18}
              onPress={() => onMenuOpen(item.id)}
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
    </View>
  );
}

export default React.memo(ReminderCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  cardLeft: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
    marginTop: spacing.xs,
  },
  cardBody: { flex: 1 },
  actionText: {
    ...typography.subheading,
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  timeText: {
    ...typography.mono,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  badgeText: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
  },
  recurrenceBadge: {
    backgroundColor: colors.badgeNeutral,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  recurrenceText: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    color: colors.muted,
  },
});
