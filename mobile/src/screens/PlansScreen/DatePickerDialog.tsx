import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Button, Dialog, Text, TextInput } from "react-native-paper";
import { colors, spacing, typography } from "../../../theme";
import { t } from "../../i18n";

interface Props {
  visible: boolean;
  onConfirm: (date: string) => void;
  onDismiss: () => void;
}

export default function DatePickerDialog({ visible, onConfirm, onDismiss }: Props) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [selectedDate, setSelectedDate] = useState(tomorrow.toISOString().slice(0, 10));

  const quickDates = [
    { label: "Today", date: new Date().toISOString().slice(0, 10) },
    { label: "Tomorrow", date: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })() },
    { label: "+2 days", date: (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); })() },
  ];

  return (
    <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
      <Dialog.Title style={typography.heading as any}>{t("plans.datePickerTitle")}</Dialog.Title>
      <Dialog.Content>
        <View style={styles.quickDates}>
          {quickDates.map(({ label, date }) => (
            <TouchableOpacity
              key={date}
              style={[styles.quickBtn, selectedDate === date && styles.quickBtnActive]}
              onPress={() => setSelectedDate(date)}
            >
              <Text style={[styles.quickText, selectedDate === date && styles.quickTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          mode="outlined"
          label="YYYY-MM-DD"
          value={selectedDate}
          onChangeText={setSelectedDate}
          style={styles.input}
        />
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss}>{t("common.cancel") || "Cancel"}</Button>
        <Button
          mode="contained"
          onPress={() => onConfirm(selectedDate)}
          disabled={!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)}
        >
          {t("plans.datePickerConfirm")}
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  dialog: {
    backgroundColor: colors.surface,
  },
  quickDates: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  quickBtnActive: {
    backgroundColor: colors.primary,
  },
  quickText: {
    fontWeight: "600",
    fontSize: 13,
    color: colors.foreground,
  },
  quickTextActive: {
    color: colors.surface,
  },
  input: {
    backgroundColor: colors.surface,
  },
});
