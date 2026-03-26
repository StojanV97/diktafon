import React, { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { IconButton, Menu, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, radii, elevation, typography } from "../../../theme";
import { t } from "../../i18n";

interface Props {
  plan: any;
  onEdit: (planId: string, items: string[]) => void;
  onDelete: (planId: string) => void;
}

export default function PlanCard({ plan, onEdit, onDelete }: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<string[]>(plan.items);

  const [year, month, day] = plan.date.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dateLabel = dateObj.toLocaleDateString("sr-Latn-RS", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const handleSaveEdit = () => {
    const filtered = editItems.filter((item) => item.trim().length > 0);
    if (filtered.length > 0) {
      onEdit(plan.id, filtered);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditItems(plan.items);
    setEditing(false);
  };

  return (
    <View style={[styles.card, elevation.sm]}>
      <View style={styles.header}>
        <View style={styles.dateRow}>
          <MaterialCommunityIcons name="calendar-outline" size={16} color={colors.primary} />
          <Text style={styles.dateText}>{dateLabel}</Text>
        </View>
        {!editing && (
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <IconButton
                icon="dots-vertical"
                iconColor={colors.muted}
                size={18}
                onPress={() => setMenuVisible(true)}
              />
            }
          >
            <Menu.Item
              leadingIcon="pencil-outline"
              onPress={() => { setMenuVisible(false); setEditing(true); }}
              title={t("common.edit")}
            />
            <Menu.Item
              leadingIcon="delete-outline"
              onPress={() => { setMenuVisible(false); onDelete(plan.id); }}
              title={t("common.delete")}
            />
          </Menu>
        )}
      </View>

      {editing ? (
        <View style={styles.editArea}>
          {editItems.map((item, idx) => (
            <View key={idx} style={styles.editRow}>
              <Text style={styles.bullet}>{"\u2022"}</Text>
              <TextInput
                style={styles.editInput}
                value={item}
                onChangeText={(text) => {
                  const next = [...editItems];
                  next[idx] = text;
                  setEditItems(next);
                }}
              />
              <TouchableOpacity onPress={() => setEditItems(editItems.filter((_, i) => i !== idx))}>
                <MaterialCommunityIcons name="close-circle-outline" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={styles.addItemBtn}
            onPress={() => setEditItems([...editItems, ""])}
          >
            <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
            <Text style={styles.addItemText}>{t("common.add") || "Add"}</Text>
          </TouchableOpacity>
          <View style={styles.editActions}>
            <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>{t("common.cancel") || "Cancel"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSaveEdit} style={styles.saveBtn}>
              <Text style={styles.saveText}>{t("common.save") || "Save"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.itemsArea}>
          {plan.items.map((item: string, idx: number) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={styles.bullet}>{"\u2022"}</Text>
              <Text style={styles.itemText}>{item}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  dateText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.foreground,
  },
  itemsArea: {
    gap: spacing.xs,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  bullet: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.primary,
    lineHeight: 22,
  },
  itemText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.foreground,
    lineHeight: 22,
    flex: 1,
  },
  editArea: {
    gap: spacing.xs,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  editInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.foreground,
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryLight,
    paddingVertical: 4,
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  addItemText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: colors.primary,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.muted,
  },
  saveBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
  },
  saveText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#FFF",
  },
});
