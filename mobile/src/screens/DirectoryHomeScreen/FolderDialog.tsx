import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Button, Dialog, Text, TextInput } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, radii, typography, FOLDER_COLORS } from "../../../theme";
import { t } from "../../i18n";

interface Props {
  visible: boolean;
  mode: "create" | "edit";
  name: string;
  onNameChange: (name: string) => void;
  color: string;
  onColorChange: (color: string) => void;
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  tagInput: string;
  onTagInputChange: (input: string) => void;
  tagSuggestions: string[];
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
  tags,
  onAddTag,
  onRemoveTag,
  tagInput,
  onTagInputChange,
  tagSuggestions,
  loading,
  onConfirm,
  onDismiss,
}: Props) {
  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (!tag || tags.includes(tag)) return;
    onAddTag(tag);
    onTagInputChange("");
  };

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

          <Text style={[typography.monoLabel as any, { marginBottom: spacing.sm, marginTop: spacing.xs }]}>
            {t("home.tags")}
          </Text>
          <View style={styles.tagInputRow}>
            <TextInput
              label={t("home.newTag")}
              value={tagInput}
              onChangeText={onTagInputChange}
              onSubmitEditing={handleAddTag}
              mode="outlined"
              dense
              style={styles.tagTextInput}
              outlineColor={colors.borderGhost}
              activeOutlineColor={colors.primary}
            />
            <Button
              mode="contained"
              compact
              onPress={handleAddTag}
              style={styles.addTagBtn}
              buttonColor={colors.primary}
            >
              {t("common.add")}
            </Button>
          </View>

          {tagSuggestions.length > 0 && (
            <View style={styles.suggestions}>
              {tagSuggestions.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  onPress={() => {
                    onAddTag(tag);
                    onTagInputChange("");
                  }}
                  style={styles.suggestionChip}
                >
                  <Text style={styles.suggestionText}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {tags.length > 0 && (
            <View style={styles.currentTags}>
              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  onPress={() => onRemoveTag(tag)}
                  style={styles.dialogTagChip}
                >
                  <Text style={styles.dialogTagChipText}>{tag.toLowerCase()}</Text>
                  <MaterialCommunityIcons name="close" size={14} color={colors.muted} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              ))}
            </View>
          )}
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
  tagInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tagTextInput: { flex: 1, backgroundColor: colors.surface },
  addTagBtn: { marginTop: 6, borderRadius: radii.sm },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  suggestionChip: {
    backgroundColor: colors.primaryLight,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  suggestionText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: colors.primary,
  },
  currentTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dialogTagChip: {
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  dialogTagChipText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: colors.foreground,
  },
});
