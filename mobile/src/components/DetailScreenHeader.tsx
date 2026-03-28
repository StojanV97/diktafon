import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme";
import HeaderBackButton from "./HeaderBackButton";
import HeaderMenuButton from "./HeaderMenuButton";

interface Props {
  title: string;
  subtitle?: string;
  onMenuPress?: () => void;
}

export default function DetailScreenHeader({ title, subtitle, onMenuPress }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.row, subtitle ? styles.rowWithSubtitle : undefined]}>
        <HeaderBackButton />
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
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
  rowWithSubtitle: {
    height: 56,
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: spacing.md,
  },
  title: {
    textAlign: "center",
    fontWeight: "600",
    fontWeight: "600",
    fontSize: 15,
    color: colors.foreground,
  },
  subtitle: {
    textAlign: "center",
    fontFamily: "Menlo",
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
});
