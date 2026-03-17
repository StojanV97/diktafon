import React from "react";
import { Image, StyleSheet, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing } from "../theme";

export function AppHeaderLeft({ onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.logoBtn}>
      <Image source={require("../assets/icon.png")} style={styles.logoImg} />
    </TouchableOpacity>
  );
}

export function AppHeaderRight({ onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.aiBtn}>
      <MaterialCommunityIcons name="creation" size={18} color={colors.primary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  logoBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    resizeMode: "contain",
  },
  aiBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
});
