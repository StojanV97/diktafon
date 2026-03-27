import React, { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { IconButton, Menu, Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, spacing, radii, elevation, iconSize, typography } from "../../../theme";
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
      <View style={styles.cardContent}>
      {/* Top row: category label + menu */}
      <View style={styles.topRow}>
        <View style={styles.categoryRow}>
          <MaterialCommunityIcons name="calendar-outline" size={iconSize.sm} color={colors.primary} style={{ marginRight: spacing.xs }} />
          <Text style={styles.categoryLabel}>{dateLabel.toUpperCase()}</Text>
        </View>
        {!editing && (
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <IconButton
                icon="dots-vertical"
                iconColor={colors.muted}
                size={iconSize.md}
                onPress={() => setMenuVisible(true)}
                style={styles.menuBtn}
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
                defaultValue={item}
                onChangeText={(text) => {
                  editItems[idx] = text;
                }}
                onEndEditing={(e) => {
                  setEditItems((prev) => {
                    const next = [...prev];
                    next[idx] = e.nativeEvent.text;
                    return next;
                  });
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  cardContent: {
    padding: spacing.lg,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  categoryLabel: {
    ...typography.monoLabel,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.primary,
  },
  menuBtn: {
    margin: -spacing.sm,
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
    ...typography.body,
    color: colors.primary,
    lineHeight: 22,
  },
  itemText: {
    ...typography.body,
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
    ...typography.body,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingVertical: spacing.xs,
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  addItemText: {
    ...typography.label,
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
    ...typography.subheading,
    color: colors.muted,
  },
  saveBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
  },
  saveText: {
    ...typography.subheading,
    color: colors.surface,
  },
});
