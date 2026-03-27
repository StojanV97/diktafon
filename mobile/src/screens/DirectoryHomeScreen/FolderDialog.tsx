import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Button, Dialog, Text, TextInput } from "react-native-paper";
import { colors, spacing, radii, typography, FOLDER_COLORS } from "../../../theme";
import { t } from "../../i18n";

interface Props {
  visible: boolean;
  mode: "create" | "edit";
  name: string;
  onNameChange: (name: string) => void;
  color: string;
  onColorChange: (color: string) => void;
  loading: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export default function FolderDialog({
  visible,
  mode,
  name,
  onNameChange,
  color,
  onColorChange,
  loading,
  onConfirm,
  onDismiss,
}: Props) {
  return (
    <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
      <Dialog.Title style={typography.heading}>
        {mode === "create" ? t("home.newFolderTitle") : t("home.editFolderTitle")}
      </Dialog.Title>
      <Dialog.ScrollArea style={styles.dialogScrollArea}>
        <ScrollView>
          <TextInput
            label={t("home.folderName")}
            value={name}
            onChangeText={onNameChange}
            mode="outlined"
            autoFocus
            maxLength={100}
            style={styles.dialogInput}
            outlineColor={colors.borderGhost}
            activeOutlineColor={colors.primary}
          />

          <Text style={[typography.monoLabel as any, { marginBottom: spacing.sm, marginTop: spacing.xs }]}>
            {t("home.color")}
          </Text>
          <View style={styles.colorRow}>
            {FOLDER_COLORS.map((c: string) => (
              <TouchableOpacity
                key={c}
                onPress={() => onColorChange(c)}
                style={[
                  styles.colorCircle,
                  { backgroundColor: c },
                  color === c && styles.colorCircleSelected,
                ]}
              />
            ))}
          </View>
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions>
        <Button onPress={onDismiss} textColor={colors.muted}>
          {t("common.cancel")}
        </Button>
        <Button onPress={onConfirm} textColor={colors.primary} disabled={loading} loading={loading}>
          {mode === "create" ? t("common.create") : t("common.save")}
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  dialogScrollArea: { paddingHorizontal: 24, maxHeight: 400 },
  dialogInput: { marginBottom: spacing.md, backgroundColor: colors.surface },
  colorRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: spacing.lg,
    flexWrap: "wrap",
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: colors.foreground,
  },
});
