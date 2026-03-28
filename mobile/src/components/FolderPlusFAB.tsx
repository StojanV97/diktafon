import React from "react";
import { StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, radii, elevation } from "../../theme";

type Props = {
  onPress: () => void;
  style?: ViewStyle;
};

export default function FolderPlusFAB({ onPress, style }: Props) {
  return (
    <TouchableOpacity
      style={[styles.fab, elevation.md, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <MaterialCommunityIcons name="folder-plus-outline" size={22} color={colors.primary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg + 48 + spacing.md,
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
