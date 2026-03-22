import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { formatDuration, formatSectionDate } from "../../utils/formatters";
import { colors, spacing, typography } from "../../../theme";
import { t } from "../../i18n";

const sectionCountStyle = [typography.caption, { marginLeft: spacing.sm }];

interface Props {
  date: string;
  allData: any[];
  isCollapsed: boolean;
  onToggle: (date: string) => void;
}

function DailySectionHeader({ date, allData, isCollapsed, onToggle }: Props) {
  const totalDur = allData.reduce((s: number, e: any) => s + (e.duration_seconds || 0), 0);

  return (
    <View style={styles.sectionHeader}>
      <TouchableOpacity
        style={styles.sectionHeaderLeft}
        onPress={() => onToggle(date)}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name={isCollapsed ? "chevron-right" : "chevron-down"}
          size={18}
          color={colors.muted}
        />
        <Text style={styles.sectionTitle}>{formatSectionDate(date)}</Text>
        <Text style={sectionCountStyle}>
          {allData.length} {t("dailyLog.clipSeparator")} {formatDuration(totalDur)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(DailySectionHeader);

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.foreground,
    marginLeft: spacing.xs,
  },
});
