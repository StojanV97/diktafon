import React, { useCallback, useEffect, useState } from "react";
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
  Dialog,
  FAB,
  IconButton,
  Menu,
  Portal,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper";
import { fetchTranscriptions, deleteTranscription } from "../services/api";

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("sr-Latn-RS");
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function HomeScreen({ navigation }) {
  const theme = useTheme();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Menu state
  const [menuVisible, setMenuVisible] = useState(null);

  // Delete dialog
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await fetchTranscriptions();
      setRecords(data);
    } catch (e) {
      setSnackbar(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  const onDeletePress = (id, filename) => {
    setMenuVisible(null);
    setDeleteTarget({ id, filename });
    setDeleteDialogVisible(true);
  };

  const onDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTranscription(deleteTarget.id);
      setRecords((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    } catch (e) {
      setSnackbar(e.message);
    }
    setDeleteDialogVisible(false);
    setDeleteTarget(null);
  };

  const renderItem = ({ item }) => (
    <Card
      style={styles.card}
      onPress={() => navigation.navigate("Detail", { id: item.id })}
    >
      <Card.Content>
        <View style={styles.cardHeader}>
          <Text variant="titleSmall" style={styles.filename} numberOfLines={1}>
            {item.filename}
          </Text>
          <View style={styles.cardMeta}>
            {item.duration_seconds > 0 && (
              <Text variant="bodySmall" style={styles.duration}>
                {formatDuration(item.duration_seconds)}
              </Text>
            )}
            <Menu
              visible={menuVisible === item.id}
              onDismiss={() => setMenuVisible(null)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  size={18}
                  onPress={() => setMenuVisible(item.id)}
                />
              }
            >
              <Menu.Item
                leadingIcon="delete-outline"
                onPress={() => onDeletePress(item.id, item.filename)}
                title="Obriši"
              />
            </Menu>
          </View>
        </View>
        <Text variant="bodySmall" style={styles.date}>{formatDate(item.created_at)}</Text>
        <Text variant="bodySmall" style={styles.preview} numberOfLines={2}>
          {item.text}
        </Text>
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
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={records.length === 0 ? styles.empty : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <Text variant="bodyLarge" style={styles.emptyText}>
            Nema transkripata.{"\n"}Tapni + da dodaš snimak.
          </Text>
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate("Transcribe")}
      />

      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Obriši</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Obrisati transkript za "{deleteTarget?.filename}"?
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
    backgroundColor: "#1E1E1E",
    marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  filename: { color: "#FFF", fontWeight: "600", flex: 1, marginRight: 8 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  duration: { color: "#4A9EFF" },
  date: { color: "#888", marginBottom: 6 },
  preview: { color: "#AAA", lineHeight: 18 },
  fab: {
    position: "absolute",
    bottom: 28,
    right: 24,
    backgroundColor: "#4A9EFF",
  },
});
