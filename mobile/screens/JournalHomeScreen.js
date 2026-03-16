import React, { useCallback, useState, useRef } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
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
  RadioButton,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fetchFolders, createFolder, deleteFolder, renameFolder } from "../services/journalStorage";

function formatDate(iso) {
  return new Date(iso).toLocaleString("sr-Latn-RS");
}

export default function JournalHomeScreen({ navigation }) {
  const theme = useTheme();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMode, setDialogMode] = useState("create"); // create | rename
  const [dialogName, setDialogName] = useState("");
  const [dialogEngine, setDialogEngine] = useState("local");
  const [dialogTargetId, setDialogTargetId] = useState(null);

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

  const onAdd = () => {
    setDialogMode("create");
    setDialogName("");
    setDialogEngine("local");
    setDialogTargetId(null);
    setDialogVisible(true);
  };

  const onRename = (id, currentName) => {
    setMenuVisible(null);
    setDialogMode("rename");
    setDialogName(currentName);
    setDialogTargetId(id);
    setDialogVisible(true);
  };

  const onDialogConfirm = async () => {
    const name = dialogName.trim();
    if (!name) return;
    if (name.length > 100) {
      setSnackbar("Naziv ne može biti duži od 100 karaktera.");
      return;
    }

    try {
      if (dialogMode === "create") {
        const folder = await createFolder(name, dialogEngine);
        setFolders((prev) => [folder, ...prev]);
      } else {
        const updated = await renameFolder(dialogTargetId, name);
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

  const renderItem = ({ item }) => (
    <Card
      style={styles.card}
      onPress={() => navigation.navigate("JournalFolder", { id: item.id, name: item.name })}
    >
      <Card.Content style={styles.cardContent}>
        <MaterialCommunityIcons
          name="folder-outline"
          size={28}
          color={theme.colors.primary}
          style={styles.folderIcon}
        />
        <View style={styles.cardBody}>
          <Text variant="titleMedium" style={styles.folderName}>{item.name}</Text>
          <View style={styles.cardMeta}>
            <Text variant="bodySmall" style={styles.date}>{formatDate(item.created_at)}</Text>
            <Chip
              compact
              textStyle={styles.chipText}
              style={[
                styles.chip,
                item.engine === "assemblyai" && styles.chipAssembly,
              ]}
            >
              {item.engine === "assemblyai" ? "AssemblyAI" : "lokalni"}
            </Chip>
          </View>
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
            onPress={() => onRename(item.id, item.name)}
            title="Preimenuj"
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
            Nema foldera.{"\n"}Tapni + da kreiraš folder.
          </Text>
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={onAdd}
      />

      <Portal>
        {/* Create / Rename Dialog */}
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>
            {dialogMode === "create" ? "Novi folder" : "Preimenuj folder"}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Naziv foldera"
              value={dialogName}
              onChangeText={setDialogName}
              mode="outlined"
              autoFocus
              maxLength={100}
            />
            {dialogMode === "create" && (
              <View style={styles.enginePicker}>
                <Text variant="bodyMedium" style={styles.engineLabel}>Tip transkripcije:</Text>
                <RadioButton.Group
                  onValueChange={setDialogEngine}
                  value={dialogEngine}
                >
                  <RadioButton.Item label="Lokalni (privatno)" value="local" />
                  <RadioButton.Item label="AssemblyAI (glasovi)" value="assemblyai" />
                </RadioButton.Group>
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Otkaži</Button>
            <Button onPress={onDialogConfirm}>
              {dialogMode === "create" ? "Kreiraj" : "Sačuvaj"}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Obriši folder</Dialog.Title>
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
  emptyText: { color: "#666", textAlign: "center", lineHeight: 26 },
  card: {
    marginBottom: 10,
    backgroundColor: "#1E1E1E",
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  folderIcon: { marginRight: 12 },
  cardBody: { flex: 1 },
  folderName: { color: "#FFF", fontWeight: "600" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  date: { color: "#888" },
  chip: {
    backgroundColor: "#2A2A2A",
    height: 24,
  },
  chipAssembly: {
    backgroundColor: "#1A2A3A",
  },
  chipText: {
    fontSize: 11,
    lineHeight: 14,
    marginVertical: 0,
  },
  fab: {
    position: "absolute",
    bottom: 28,
    right: 24,
    backgroundColor: "#4A9EFF",
  },
  enginePicker: { marginTop: 16 },
  engineLabel: { marginBottom: 8, color: "#AAA" },
});
