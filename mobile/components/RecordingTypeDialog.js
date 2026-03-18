import React from "react";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import { Dialog, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, radii, typography } from "../theme";

export default function RecordingTypeDialog({ visible, onDismiss, onConfirm }) {
  return (
    <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
      <Dialog.Title style={typography.heading}>Vrsta snimka</Dialog.Title>
      <Dialog.Content>
        <TouchableOpacity
          style={styles.row}
          onPress={() => onConfirm("beleshka")}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="note-text-outline" size={24} color={colors.primary} />
          <View style={styles.info}>
            <Text style={[typography.heading, { fontSize: 15 }]}>Beleška</Text>
            <Text style={[typography.body, { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }]}>
              Jedan govornik
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.row}
          onPress={() => onConfirm("razgovor")}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="account-group-outline" size={24} color={colors.primary} />
          <View style={styles.info}>
            <Text style={[typography.heading, { fontSize: 15 }]}>Razgovor</Text>
            <Text style={[typography.body, { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }]}>
              Više govornika
            </Text>
          </View>
        </TouchableOpacity>
      </Dialog.Content>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: radii.lg, backgroundColor: colors.surface },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  info: { flex: 1 },
});
