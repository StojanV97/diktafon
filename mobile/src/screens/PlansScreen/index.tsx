import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, typography } from "../../../theme";
import { t } from "../../i18n";

export default function PlansScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.empty}>
        <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={colors.muted} />
        <Text style={[typography.heading, { marginTop: spacing.lg, color: colors.muted }]}>
          {t("plans.emptyTitle")}
        </Text>
        <Text style={[typography.body, styles.emptyText]}>
          {t("plans.emptyMessage")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 22,
  },
});
