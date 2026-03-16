import React, { useCallback, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fetchFolders, createFolder, deleteFolder, renameFolder } from "../services/journalStorage";

function formatDate(iso) {
  return new Date(iso).toLocaleString("sr-Latn-RS");
}

export default function JournalHomeScreen({ navigation }) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchFolders();
      setFolders(data);
    } catch (e) {
      Alert.alert("Greška", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  const promptFolderName = (engine) => {
    Alert.prompt("Novi folder", "Unesite naziv foldera:", [
      { text: "Otkaži", style: "cancel" },
      {
        text: "Kreiraj",
        onPress: async (name) => {
          if (!name?.trim()) return;
          if (name.trim().length > 100) {
            Alert.alert("Greška", "Naziv ne može biti duži od 100 karaktera.");
            return;
          }
          try {
            const folder = await createFolder(name.trim(), engine);
            setFolders((prev) => [folder, ...prev]);
          } catch (e) {
            Alert.alert("Greška", e.message);
          }
        },
      },
    ]);
  };

  const onAdd = () => {
    Alert.alert("Tip transkripcije", "Izaberi tip za novi folder:", [
      { text: "Otkaži", style: "cancel" },
      { text: "Lokalni (privatno)", onPress: () => promptFolderName("local") },
      { text: "AssemblyAI (glasovi)", onPress: () => promptFolderName("assemblyai") },
    ]);
  };

  const onRename = (id, currentName) => {
    Alert.prompt("Preimenuj folder", "Novi naziv:", [
      { text: "Otkaži", style: "cancel" },
      {
        text: "Sačuvaj",
        onPress: async (name) => {
          if (!name?.trim()) return;
          if (name.trim().length > 100) {
            Alert.alert("Greška", "Naziv ne može biti duži od 100 karaktera.");
            return;
          }
          try {
            const updated = await renameFolder(id, name.trim());
            setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)));
          } catch (e) {
            Alert.alert("Greška", e.message);
          }
        },
      },
    ], "plain-text", currentName);
  };

  const onDelete = (id, name) => {
    Alert.alert("Obriši folder", `Obrisati "${name}" i sve zapise u njemu?`, [
      { text: "Otkaži", style: "cancel" },
      {
        text: "Obriši",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteFolder(id);
            setFolders((prev) => prev.filter((f) => f.id !== id));
          } catch (e) {
            Alert.alert("Greška", e.message);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => navigation.navigate("JournalFolder", { id: item.id, name: item.name })}
      onLongPress={() => {
        Alert.alert(item.name, "Izaberite akciju:", [
          { text: "Otkaži", style: "cancel" },
          { text: "Preimenuj", onPress: () => onRename(item.id, item.name) },
          { text: "Obriši", style: "destructive", onPress: () => onDelete(item.id, item.name) },
        ]);
      }}
    >
      <Text style={styles.folderIcon}>📁</Text>
      <View style={styles.cardBody}>
        <Text style={styles.folderName}>{item.name}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.date}>{formatDate(item.created_at)}</Text>
          <Text style={[styles.engineBadge, item.engine === "assemblyai" && styles.engineBadgeAssembly]}>
            {item.engine === "assemblyai" ? "AssemblyAI" : "lokalni"}
          </Text>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A9EFF" />
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
            tintColor="#4A9EFF"
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Nema foldera.{"\n"}Tapni + da kreiraš folder.
          </Text>
        }
      />
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={onAdd}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#111" },
  list: { padding: 12 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#666", fontSize: 16, textAlign: "center", lineHeight: 26 },
  card: {
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  cardPressed: { opacity: 0.7 },
  folderIcon: { fontSize: 28, marginRight: 12 },
  cardBody: { flex: 1 },
  folderName: { color: "#FFF", fontWeight: "600", fontSize: 16 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  date: { color: "#888", fontSize: 12 },
  engineBadge: {
    color: "#888",
    fontSize: 11,
    backgroundColor: "#2A2A2A",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  engineBadgeAssembly: { color: "#4A9EFF", backgroundColor: "#1A2A3A" },
  chevron: { color: "#555", fontSize: 24, marginLeft: 8 },
  fab: {
    position: "absolute",
    bottom: 28,
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#4A9EFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#4A9EFF",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  fabPressed: { opacity: 0.8 },
  fabText: { color: "#FFF", fontSize: 32, lineHeight: 36 },
});
