import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { ActivityIndicator, Button, Dialog, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, radii, typography } from "../../../theme";
import { t } from "../../i18n";

interface Folder {
  id: string;
  name: string;
  color?: string;
}

interface Props {
  visible: boolean;
  folders: Folder[];
  loading: boolean;
  onSelect: (folderId: string, folderName: string) => void;
  onDismiss: () => void;
}

export default function MoveToFolderDialog({
  visible,
  folders,
  loading,
  onSelect,
  onDismiss,
}: Props) {
  return (
    <Dialog
      visible={visible}
      onDismiss={() => !loading && onDismiss()}
      style={styles.dialog}
    >
      <Dialog.Title style={typography.heading}>
        {t("dailyLog.selectFolder")}
      </Dialog.Title>
      <Dialog.Content>
        {folders.length === 0 ? (
          <Text style={typography.body}>{t("dailyLog.noFolders")}</Text>
        ) : (
          folders.map((folder) => (
            <TouchableOpacity
              key={folder.id}
              style={[styles.folderRow, loading && { opacity: 0.5 }]}
              onPress={() => onSelect(folder.id, folder.name)}
              disabled={loading}
            >
              <View
                style={[
                  styles.folderDot,
                  { backgroundColor: folder.color || colors.primary },
                ]}
              />
              <Text style={[typography.body, { flex: 1 }]}>{folder.name}</Text>
              {loading ? (
                <ActivityIndicator size={16} color={colors.muted} />
              ) : (
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={18}
                  color={colors.muted}
                />
              )}
            </TouchableOpacity>
          ))
        )}
      </Dialog.Content>
      <Dialog.Actions>
        <Button
          onPress={onDismiss}
          textColor={colors.muted}
          disabled={loading}
        >
          {t("common.cancel")}
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
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  folderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },
});
