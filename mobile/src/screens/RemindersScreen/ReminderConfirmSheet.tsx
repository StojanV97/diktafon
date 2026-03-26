import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, spacing, radii, typography } from "../../../theme";
import { t } from "../../i18n";
import type { Recurrence, RecurrenceType, ParsedReminderResult } from "../../types/reminder";

interface Props {
  visible: boolean;
  parsed: ParsedReminderResult;
  onConfirm: (action: string, datetime: string, recurrence: Recurrence | null) => void;
  onCancel: () => void;
  saving: boolean;
}

const RECURRENCE_OPTIONS: { key: RecurrenceType | "once"; label: string }[] = [
  { key: "once", label: "reminders.once" },
  { key: "daily", label: "reminders.daily" },
  { key: "weekly", label: "reminders.weekly" },
  { key: "monthly", label: "reminders.monthly" },
];

export default function ReminderConfirmSheet({
  visible,
  parsed,
  onConfirm,
  onCancel,
  saving,
}: Props) {
  const [action, setAction] = useState(parsed.action);
  const [date, setDate] = useState<Date>(
    parsed.datetime ? new Date(parsed.datetime) : new Date()
  );
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType | "once">(
    parsed.recurrence?.type || "once"
  );
  const [showDatePicker, setShowDatePicker] = useState(!parsed.datetime);
  const [showTimePicker, setShowTimePicker] = useState(!parsed.datetime);

  // Reset state when parsed changes
  React.useEffect(() => {
    setAction(parsed.action);
    setDate(parsed.datetime ? new Date(parsed.datetime) : new Date());
    setRecurrenceType(parsed.recurrence?.type || "once");
    setShowDatePicker(!parsed.datetime);
    setShowTimePicker(!parsed.datetime);
  }, [parsed]);

  const handleConfirm = () => {
    const recurrence: Recurrence | null =
      recurrenceType === "once"
        ? null
        : {
            type: recurrenceType,
            ...(recurrenceType === "weekly"
              ? { days_of_week: [date.getDay()] }
              : {}),
          };
    onConfirm(action, date.toISOString(), recurrence);
  };

  const formatDisplayTime = (d: Date) => {
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{t("reminders.confirmTitle")}</Text>

          {!parsed.datetime && (
            <View style={styles.warningRow}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={16}
                color={colors.warning}
              />
              <Text style={styles.warningText}>
                {t("reminders.noTimeDetected")}
              </Text>
            </View>
          )}

          {/* Action */}
          <Text style={styles.label}>{t("reminders.actionLabel")}</Text>
          <TextInput
            style={styles.input}
            value={action}
            onChangeText={setAction}
            multiline
            maxLength={500}
          />

          {/* Time */}
          <Text style={styles.label}>{t("reminders.timeLabel")}</Text>
          <TouchableOpacity
            style={styles.timeRow}
            onPress={() => {
              setShowDatePicker(true);
              setShowTimePicker(true);
            }}
          >
            <Text style={styles.timeValue}>{formatDisplayTime(date)}</Text>
            <Text style={styles.changeLink}>{t("reminders.changeTime")}</Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_e, selectedDate) => {
                if (Platform.OS === "android") setShowDatePicker(false);
                if (selectedDate) {
                  setDate(prev => {
                    const updated = new Date(prev);
                    updated.setFullYear(
                      selectedDate.getFullYear(),
                      selectedDate.getMonth(),
                      selectedDate.getDate()
                    );
                    return updated;
                  });
                }
              }}
              minimumDate={new Date()}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={date}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              is24Hour
              onChange={(_e, selectedDate) => {
                if (Platform.OS === "android") setShowTimePicker(false);
                if (selectedDate) {
                  setDate(prev => {
                    const updated = new Date(prev);
                    updated.setHours(
                      selectedDate.getHours(),
                      selectedDate.getMinutes()
                    );
                    return updated;
                  });
                }
              }}
            />
          )}

          {/* Recurrence */}
          <Text style={styles.label}>{t("reminders.recurrenceLabel")}</Text>
          <View style={styles.recurrenceRow}>
            {RECURRENCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.recurrenceChip,
                  recurrenceType === opt.key && styles.recurrenceChipActive,
                ]}
                onPress={() => setRecurrenceType(opt.key)}
              >
                <Text
                  style={[
                    styles.recurrenceChipText,
                    recurrenceType === opt.key && styles.recurrenceChipTextActive,
                  ]}
                >
                  {t(opt.label)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={saving}
            >
              <Text style={styles.cancelBtnText}>{t("reminders.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, saving && { opacity: 0.6 }]}
              onPress={handleConfirm}
              disabled={saving || !action.trim()}
            >
              {saving ? (
                <ActivityIndicator size={16} color={colors.surface} />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {t("reminders.confirm")}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: 40,
  },
  title: {
    ...typography.heading,
    fontSize: 18,
    marginBottom: spacing.md,
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningLight,
    padding: spacing.sm,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  warningText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.warning,
    flex: 1,
  },
  label: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 44,
    textAlignVertical: "top",
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  timeValue: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 15,
    color: colors.foreground,
  },
  changeLink: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: colors.primary,
  },
  recurrenceRow: {
    flexDirection: "row",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  recurrenceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 100,
    backgroundColor: colors.background,
  },
  recurrenceChipActive: {
    backgroundColor: colors.primary,
  },
  recurrenceChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: colors.muted,
  },
  recurrenceChipTextActive: {
    color: colors.surface,
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.background,
  },
  cancelBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: colors.muted,
  },
  confirmBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  confirmBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: colors.surface,
  },
});
