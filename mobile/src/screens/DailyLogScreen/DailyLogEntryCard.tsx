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
import { colors, spacing, radii, elevation, iconSize, typography } from "../../../theme";
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
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: sc.fg }]} />

      <View style={styles.cardContent}>
        {/* Top row: category label + menu */}
        <View style={styles.topRow}>
          <View style={styles.categoryRow}>
            {isProcessing ? (
              <ActivityIndicator size={iconSize.xs} color={sc.fg} style={{ marginRight: spacing.xs }} />
            ) : (
              <MaterialCommunityIcons name={sc.icon as any} size={iconSize.sm} color={sc.fg} style={{ marginRight: spacing.xs }} />
            )}
            <Text style={[styles.categoryLabel, { color: sc.fg }]}>{sc.label}</Text>
            <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
            {item.duration_seconds > 0 && (
              <Text style={styles.timeText}> · {formatDuration(item.duration_seconds)}</Text>
            )}
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

        {/* Main content */}
        {isDone && item.text ? (
          <Text style={styles.preview} numberOfLines={2}>{item.text}</Text>
        ) : isRecorded ? (
          <TouchableOpacity
            style={styles.transcribeLink}
            onPress={() => onTranscribe(item.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.transcribeLinkText}>{t("dailyLog.toText")}</Text>
            <MaterialCommunityIcons name="chevron-right" size={iconSize.sm} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(DailyLogEntryCard);

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
  },
  categoryLabel: {
    ...typography.monoLabel,
    fontSize: 10,
    letterSpacing: 1,
    marginRight: spacing.sm,
  },
  timeText: {
    ...typography.mono,
    fontSize: 11,
  },
  menuBtn: {
    margin: -spacing.sm,
  },
  preview: {
    ...typography.bodySmall,
    color: colors.foreground,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  transcribeLink: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  transcribeLinkText: {
    ...typography.label,
  },
});
