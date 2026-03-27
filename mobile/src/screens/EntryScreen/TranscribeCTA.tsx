import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, radii, typography } from "../../../theme";
import { t } from "../../i18n";

interface TranscribeCTAProps {
  onPress: () => void;
}

export default function TranscribeCTA({ onPress }: TranscribeCTAProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons
          name="text-box-outline"
          size={28}
          color={colors.primary}
        />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{t("entry.transcribeTitle")}</Text>
        <Text style={styles.description}>
          {t("entry.transcribeDescription")}
        </Text>
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={24}
        color={colors.primary}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...typography.heading,
    color: colors.primary,
  } as any,
  description: {
    ...typography.bodySmall,
    color: colors.muted,
    marginTop: 2,
  } as any,
});
