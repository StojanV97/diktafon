import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, spacing, radii, typography } from "../../theme";

interface Props {
  title: string;
  rightElement?: React.ReactNode;
}

export default function ScreenHeader({ title, rightElement }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={typography.monoLabel as any}>DIKTAPHONE</Text>
          <Text style={[typography.title, { marginTop: spacing.xs }]}>{title}</Text>
        </View>
        <View style={styles.rightRow}>
          {rightElement}
          <TouchableOpacity
            onPress={() => navigation.navigate("Settings")}
            style={styles.settingsBtn}
          >
            <MaterialCommunityIcons name="cog-outline" size={22} color={colors.muted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xl,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
});
