import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchTranscriptions();
      setRecords(data);
    } catch (e) {
      Alert.alert("Greška", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  const onDelete = (id, filename) => {
    Alert.alert("Obriši", `Obrisati transkript za "${filename}"?`, [
      { text: "Otkaži", style: "cancel" },
      {
        text: "Obriši",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTranscription(id);
            setRecords((prev) => prev.filter((r) => r.id !== id));
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
      onPress={() => navigation.navigate("Detail", { id: item.id })}
      onLongPress={() => onDelete(item.id, item.filename)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.filename} numberOfLines={1}>
          {item.filename}
        </Text>
        {item.duration_seconds > 0 && (
          <Text style={styles.duration}>{formatDuration(item.duration_seconds)}</Text>
        )}
      </View>
      <Text style={styles.date}>{formatDate(item.created_at)}</Text>
      <Text style={styles.preview} numberOfLines={2}>
        {item.text}
      </Text>
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
            tintColor="#4A9EFF"
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Nema transkripata.{"\n"}Tapni + da dodaš snimak.
          </Text>
        }
      />
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => navigation.navigate("Transcribe")}
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
  },
  cardPressed: { opacity: 0.7 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  filename: { color: "#FFF", fontWeight: "600", fontSize: 15, flex: 1, marginRight: 8 },
  duration: { color: "#4A9EFF", fontSize: 13 },
  date: { color: "#888", fontSize: 12, marginBottom: 6 },
  preview: { color: "#AAA", fontSize: 13, lineHeight: 18 },
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
