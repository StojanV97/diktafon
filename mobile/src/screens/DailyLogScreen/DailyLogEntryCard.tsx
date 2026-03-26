import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import {
  ActivityIndicator,
  IconButton,
  Menu,
  Text,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { statusConfig } from "../../../utils/entryUtils";
import { formatDuration, formatTime } from "../../utils/formatters";
import { colors, spacing, radii, elevation, typography } from "../../../theme";
import { t } from "../../i18n";

interface Props {
  item: any;
  isMenuOpen: boolean;
  onMenuOpen: (id: string) => void;
  onMenuClose: () => void;
  onPress: (id: string) => void;
  onTranscribe: (id: string) => void;
  onMove: (id: string) => void;
  onDelete: (id: string, filename: string) => void;
}

function DailyLogEntryCard({
  item,
  isMenuOpen,
  onMenuOpen,
  onMenuClose,
  onPress,
  onTranscribe,
  onMove,
  onDelete,
}: Props) {
  const status = item.status ?? "done";
  const isRecorded = status === "recorded" || status === "error";
  const isProcessing = status === "processing";
  const isDone = !isRecorded && !isProcessing;
  const sc = statusConfig(status);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(item.id)}
      style={[styles.card, elevation.sm]}
    >
      <View style={styles.cardRow}>
        <View style={styles.cardLeft}>
          <Text style={styles.timeLabel}>{formatTime(item.created_at)}</Text>
          {item.duration_seconds > 0 && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>
                {formatDuration(item.duration_seconds)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
              {isProcessing ? (
                <ActivityIndicator
                  size={10}
                  color={sc.fg}
                  style={{ marginRight: 4 }}
                />
              ) : (
                <MaterialCommunityIcons
                  name={sc.icon as any}
                  size={12}
                  color={sc.fg}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text style={[styles.statusText, { color: sc.fg }]}>
                {sc.label}
              </Text>
            </View>
            {isRecorded && (
              <TouchableOpacity
                style={styles.transcribeLink}
                onPress={() => onTranscribe(item.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.transcribeLinkText}>
                  {t("dailyLog.toText")}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={14}
                  color={colors.primary}
                />
              </TouchableOpacity>
            )}
          </View>
          {isDone && item.text ? (
            <Text
              style={[typography.body, styles.preview]}
              numberOfLines={2}
            >
              {item.text}
            </Text>
          ) : null}
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
          {isRecorded && (
            <Menu.Item
              leadingIcon="text-recognition"
              onPress={() => onTranscribe(item.id)}
              title={t("dailyLog.toText")}
            />
          )}
          <Menu.Item
            leadingIcon="folder-move-outline"
            onPress={() => onMove(item.id)}
            title={t("dailyLog.moveToFolder")}
          />
          <Menu.Item
            leadingIcon="delete-outline"
            onPress={() => onDelete(item.id, item.filename)}
            title={t("common.delete")}
          />
        </Menu>
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(DailyLogEntryCard);

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
    marginRight: spacing.md,
    minWidth: 44,
  },
  timeLabel: {
    ...typography.caption,
    color: colors.foreground,
  },
  durationBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  durationText: {
    ...typography.mono,
    fontSize: 11,
    color: colors.primary,
  },
  cardBody: { flex: 1 },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  statusText: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
  },
  preview: {
    ...typography.bodySmall,
    color: colors.muted,
    lineHeight: 20,
  },
  transcribeLink: {
    flexDirection: "row",
    alignItems: "center",
  },
  transcribeLinkText: {
    ...typography.label,
  },
});
