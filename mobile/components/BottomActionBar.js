import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing } from "../theme";

export default function BottomActionBar({
  leftIcon,
  leftLabel,
  onLeftPress,
  centerIcon,
  centerLabel,
  onCenterPress,
  centerDisabled,
  onRightPress,
  isRecording,
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bottomBar, { paddingBottom: insets.bottom }]}>
      <TouchableOpacity onPress={onLeftPress} style={styles.bottomBtn}>
        <MaterialCommunityIcons name={leftIcon} size={24} color={colors.primary} />
        <Text style={styles.bottomBtnText}>{leftLabel}</Text>
      </TouchableOpacity>

      {centerIcon && (
        <TouchableOpacity
          onPress={centerDisabled ? undefined : onCenterPress}
          style={[styles.bottomBtn, centerDisabled && styles.bottomBtnDisabled]}
        >
          <MaterialCommunityIcons
            name={centerIcon}
            size={24}
            color={centerDisabled ? colors.muted : colors.primary}
          />
          <Text style={[styles.bottomBtnText, centerDisabled && { color: colors.muted }]}>
            {centerLabel}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={onRightPress} style={styles.bottomBtn}>
        <MaterialCommunityIcons
          name={isRecording ? "stop-circle" : "microphone"}
          size={24}
          color={isRecording ? colors.danger : colors.primary}
        />
        <Text style={[styles.bottomBtnText, isRecording && { color: colors.danger }]}>
          {isRecording ? "Zaustavi" : "Snimi"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  bottomBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  bottomBtnDisabled: {
    opacity: 0.4,
  },
  bottomBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: colors.primary,
    marginTop: 4,
  },
});
