import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, radii, elevation } from "../../../theme";
import { t } from "../../i18n";

interface Props {
  date: string;
  text: string | undefined;
  isCollapsed: boolean;
  isExpanded: boolean;
  onCopy: (date: string) => void;
  onShare: (date: string) => void;
  onToggleExpand: (date: string) => void;
}

function DailySectionFooter({
  date,
  text,
  isCollapsed,
  isExpanded,
  onCopy,
  onShare,
  onToggleExpand,
}: Props) {
  if (!text || isCollapsed) return null;

  const isLong = text.length > 300;

  return (
    <View style={[styles.combinedCard, elevation.sm]}>
      <View style={styles.combinedHeader}>
        <View style={styles.combinedTitleRow}>
          <MaterialCommunityIcons
            name="text-box-outline"
            size={18}
            color={colors.primary}
          />
          <Text style={styles.combinedTitle}>
            {t("dailyLog.combinedTranscript")}
          </Text>
        </View>
        <View style={styles.combinedActions}>
          <TouchableOpacity
            onPress={() => onCopy(date)}
            style={styles.combinedActionBtn}
          >
            <MaterialCommunityIcons
              name="content-copy"
              size={18}
              color={colors.muted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onShare(date)}
            style={styles.combinedActionBtn}
          >
            <MaterialCommunityIcons
              name="share-variant"
              size={18}
              color={colors.muted}
            />
          </TouchableOpacity>
        </View>
      </View>
      <Text
        style={styles.combinedText}
        numberOfLines={isExpanded ? undefined : 8}
        selectable={isExpanded}
      >
        {text}
      </Text>
      {isLong && (
        <TouchableOpacity onPress={() => onToggleExpand(date)}>
          <Text style={styles.expandBtn}>
            {isExpanded ? t("dailyLog.hide") : t("dailyLog.showFullText")}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default React.memo(DailySectionFooter);

const styles = StyleSheet.create({
  combinedCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  combinedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  combinedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  combinedTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.primary,
  },
  combinedActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  combinedActionBtn: {
    padding: spacing.xs,
  },
  combinedText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.foreground,
    lineHeight: 22,
  },
  expandBtn: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: colors.primary,
    marginTop: spacing.sm,
  },
});
