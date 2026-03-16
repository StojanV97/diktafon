import React, { useCallback, useState } from "react";
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Dialog,
  FAB,
  IconButton,
  Menu,
  Portal,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fetchFolders, createFolder, deleteFolder, updateFolder, getAllTags } from "../services/journalStorage";

const COLOR_PALETTE = [
  "#4A9EFF", "#FF6B6B", "#4AFF8C", "#FFB74A",
  "#B44AFF", "#FF4A9E", "#4AFFFF", "#FFE14A",
];

function formatDate(iso) {
  return new Date(iso).toLocaleString("sr-Latn-RS");
}

export default function DirectoryHomeScreen({ navigation }) {
  const theme = useTheme();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMode, setDialogMode] = useState("create");
  const [dialogName, setDialogName] = useState("");
  const [dialogColor, setDialogColor] = useState(COLOR_PALETTE[0]);
  const [dialogTags, setDialogTags] = useState([]);
  const [dialogTagInput, setDialogTagInput] = useState("");
  const [dialogTargetId, setDialogTargetId] = useState(null);
  const [allTags, setAllTags] = useState([]);

  // Delete dialog
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Menu state
  const [menuVisible, setMenuVisible] = useState(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await fetchFolders();
      setFolders(data);
    } catch (e) {
      setSnackbar(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  const openDialog = async (mode, folder) => {
    setDialogMode(mode);
    if (mode === "edit" && folder) {
      setDialogName(folder.name);
      setDialogColor(folder.color || COLOR_PALETTE[0]);
      setDialogTags(folder.tags || []);
      setDialogTargetId(folder.id);
    } else {
      setDialogName("");
      setDialogColor(COLOR_PALETTE[0]);
      setDialogTags([]);
      setDialogTargetId(null);
    }
    setDialogTagInput("");
    const tags = await getAllTags();
    setAllTags(tags);
    setDialogVisible(true);
  };

  const addTag = () => {
    const tag = dialogTagInput.trim();
    if (!tag || dialogTags.includes(tag)) return;
    setDialogTags((prev) => [...prev, tag]);
    setDialogTagInput("");
  };

  const removeTag = (tag) => {
    setDialogTags((prev) => prev.filter((t) => t !== tag));
  };

  const tagSuggestions = dialogTagInput.trim()
    ? allTags.filter(
        (t) =>
          t.toLowerCase().includes(dialogTagInput.trim().toLowerCase()) &&
          !dialogTags.includes(t)
      )
    : [];

  const onDialogConfirm = async () => {
    const name = dialogName.trim();
    if (!name) return;
    if (name.length > 100) {
      setSnackbar("Naziv ne može biti duži od 100 karaktera.");
      return;
    }

    try {
      if (dialogMode === "create") {
        const folder = await createFolder(name, dialogColor, dialogTags);
        setFolders((prev) => [folder, ...prev]);
      } else {
        const updated = await updateFolder(dialogTargetId, {
          name,
          color: dialogColor,
          tags: dialogTags,
        });
        setFolders((prev) => prev.map((f) => (f.id === dialogTargetId ? updated : f)));
      }
      setDialogVisible(false);
    } catch (e) {
      setSnackbar(e.message);
    }
  };

  const onDeletePress = (id, name) => {
    setMenuVisible(null);
    setDeleteTarget({ id, name });
    setDeleteDialogVisible(true);
  };

  const onDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFolder(deleteTarget.id);
      setFolders((prev) => prev.filter((f) => f.id !== deleteTarget.id));
    } catch (e) {
      setSnackbar(e.message);
    }
    setDeleteDialogVisible(false);
    setDeleteTarget(null);
  };

  const renderItem = ({ item }) => {
    const color = item.color || COLOR_PALETTE[0];
    const tags = item.tags || [];
    const visibleTags = tags.slice(0, 3);
    const extraCount = tags.length - visibleTags.length;

    return (
      <Card
        style={[styles.card, { borderLeftColor: color, borderLeftWidth: 4 }]}
        onPress={() => navigation.navigate("Directory", { id: item.id, name: item.name })}
      >
        <Card.Content style={styles.cardContent}>
          <MaterialCommunityIcons
            name="folder-outline"
            size={28}
            color={color}
            style={styles.folderIcon}
          />
          <View style={styles.cardBody}>
            <Text variant="titleMedium" style={styles.folderName}>{item.name}</Text>
            <Text variant="bodySmall" style={styles.date}>{formatDate(item.created_at)}</Text>
            {tags.length > 0 && (
              <View style={styles.tagRow}>
                {visibleTags.map((t) => (
                  <Chip key={t} compact textStyle={styles.tagChipText} style={styles.tagChip}>
                    {t.toLowerCase()}
                  </Chip>
                ))}
                {extraCount > 0 && (
                  <Text variant="bodySmall" style={styles.extraTags}>+{extraCount}</Text>
                )}
              </View>
            )}
          </View>
          <Menu
            visible={menuVisible === item.id}
            onDismiss={() => setMenuVisible(null)}
            anchor={
              <IconButton
                icon="dots-vertical"
                size={20}
                onPress={() => setMenuVisible(item.id)}
              />
            }
          >
            <Menu.Item
              leadingIcon="pencil-outline"
              onPress={() => { setMenuVisible(null); openDialog("edit", item); }}
              title="Izmeni"
            />
            <Menu.Item
              leadingIcon="delete-outline"
              onPress={() => onDeletePress(item.id, item.name)}
              title="Obriši"
            />
          </Menu>
        </Card.Content>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={folders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={folders.length === 0 ? styles.empty : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <Text variant="bodyLarge" style={styles.emptyText}>
            Nema direktorijuma.{"\n"}Tapni + da kreiraš direktorijum.
          </Text>
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => openDialog("create")}
      />

      <Portal>
        {/* Create / Edit Dialog */}
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>
            {dialogMode === "create" ? "Novi direktorijum" : "Izmeni direktorijum"}
          </Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView>
              <TextInput
                label="Naziv"
                value={dialogName}
                onChangeText={setDialogName}
                mode="outlined"
                autoFocus
                maxLength={100}
                style={styles.dialogInput}
              />

              {/* Color picker */}
              <Text variant="bodyMedium" style={styles.sectionLabel}>Boja</Text>
              <View style={styles.colorRow}>
                {COLOR_PALETTE.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setDialogColor(c)}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      dialogColor === c && styles.colorCircleSelected,
                    ]}
                  />
                ))}
              </View>

              {/* Tag input */}
              <Text variant="bodyMedium" style={styles.sectionLabel}>Tagovi</Text>
              <View style={styles.tagInputRow}>
                <TextInput
                  label="Novi tag"
                  value={dialogTagInput}
                  onChangeText={setDialogTagInput}
                  onSubmitEditing={addTag}
                  mode="outlined"
                  dense
                  style={styles.tagTextInput}
                />
                <Button
                  mode="contained-tonal"
                  compact
                  onPress={addTag}
                  style={styles.addTagBtn}
                >
                  Dodaj
                </Button>
              </View>

              {/* Autocomplete suggestions */}
              {tagSuggestions.length > 0 && (
                <View style={styles.suggestions}>
                  {tagSuggestions.map((t) => (
                    <Chip
                      key={t}
                      compact
                      onPress={() => {
                        setDialogTags((prev) => [...prev, t]);
                        setDialogTagInput("");
                      }}
                      textStyle={styles.suggestionText}
                      style={styles.suggestionChip}
                    >
                      {t}
                    </Chip>
                  ))}
                </View>
              )}

              {/* Current tags */}
              {dialogTags.length > 0 && (
                <View style={styles.currentTags}>
                  {dialogTags.map((t) => (
                    <Chip
                      key={t}
                      compact
                      onClose={() => removeTag(t)}
                      textStyle={styles.tagChipText}
                      style={styles.dialogTagChip}
                    >
                      {t.toLowerCase()}
                    </Chip>
                  ))}
                </View>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Otkaži</Button>
            <Button onPress={onDialogConfirm}>
              {dialogMode === "create" ? "Kreiraj" : "Sačuvaj"}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Obriši direktorijum</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Obrisati "{deleteTarget?.name}" i sve zapise u njemu?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Otkaži</Button>
            <Button onPress={onDeleteConfirm} textColor={theme.colors.error}>Obriši</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 12 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#888", textAlign: "center", lineHeight: 26 },
  card: {
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    overflow: "hidden",
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  folderIcon: { marginRight: 12 },
  cardBody: { flex: 1 },
  folderName: { color: "#111", fontWeight: "600" },
  date: { color: "#777", marginTop: 2 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  tagChip: {
    backgroundColor: "#F0F0F0",
    paddingVertical: 2,
  },
  tagChipText: {
    fontSize: 11,
    lineHeight: 13,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  extraTags: { color: "#777", alignSelf: "center", marginLeft: 4 },
  fab: {
    position: "absolute",
    bottom: 28,
    right: 24,
    backgroundColor: "#4A9EFF",
  },
  dialogScrollArea: { paddingHorizontal: 24, maxHeight: 400 },
  dialogInput: { marginBottom: 12 },
  sectionLabel: { color: "#555", marginBottom: 8, marginTop: 4 },
  colorRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: "#333",
  },
  tagInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  tagTextInput: { flex: 1 },
  addTagBtn: { marginTop: 6 },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 8,
  },
  suggestionChip: { backgroundColor: "#E3F0FF" },
  suggestionText: { fontSize: 11 },
  currentTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  dialogTagChip: {
    backgroundColor: "#F0F0F0",
  },
});
