import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme";
import HeaderBackButton from "./HeaderBackButton";
import HeaderMenuButton from "./HeaderMenuButton";

interface Props {
  title: string;
  onMenuPress?: () => void;
}

export default function DetailScreenHeader({ title, onMenuPress }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <HeaderBackButton />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <HeaderMenuButton onPress={onMenuPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    fontSize: 17,
    color: colors.foreground,
    marginHorizontal: spacing.md,
  },
});
