import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { fetchTranscription, downloadUrl } from "../services/api";

function formatDate(iso) {
  return new Date(iso).toLocaleString("sr-Latn-RS");
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m} min ${s} s`;
}

export default function TranscriptionDetailScreen({ route }) {
  const { id } = route.params;
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTranscription(id)
      .then(setRecord)
      .catch((e) => Alert.alert("Greška", e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const copyText = () => {
    if (!record?.text) return;
    Clipboard.setString(record.text);
    Alert.alert("Kopirano", "Tekst je kopiran u clipboard.");
  };

  const shareText = async () => {
    if (!record?.text) return;
    try {
      await Share.share({ message: record.text, title: record.filename });
    } catch (e) {
      // user dismissed
    }
  };

  const downloadTxt = async () => {
    try {
      const url = downloadUrl(id);
      const safeName = record.filename.replace(/\.[^.]+$/, "") + "_transkript.txt";
      const localPath = FileSystem.documentDirectory + safeName;

      const downloadResumable = FileSystem.createDownloadResumable(url, localPath);
      const { uri } = await downloadResumable.downloadAsync();

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "text/plain", UTI: "public.plain-text" });
      } else {
        Alert.alert("Sačuvano", `Fajl sačuvan: ${uri}`);
      }
    } catch (e) {
      Alert.alert("Greška", e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A9EFF" />
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Transkript nije pronađen.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.meta}>
        <Text style={styles.filename}>{record.filename}</Text>
        <Text style={styles.metaLine}>
          {formatDate(record.created_at)}
          {record.duration_seconds > 0 && `  •  ${formatDuration(record.duration_seconds)}`}
        </Text>
      </View>

      <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
        <Text style={styles.bodyText} selectable>
          {record.text}
        </Text>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          onPress={copyText}
        >
          <Text style={styles.actionIcon}>📋</Text>
          <Text style={styles.actionLabel}>Kopiraj</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          onPress={shareText}
        >
          <Text style={styles.actionIcon}>↗️</Text>
          <Text style={styles.actionLabel}>Podeli</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          onPress={downloadTxt}
        >
          <Text style={styles.actionIcon}>💾</Text>
          <Text style={styles.actionLabel}>Sačuvaj .txt</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#111" },
  errorText: { color: "#AAA", fontSize: 16 },
  meta: {
    backgroundColor: "#1A1A1A",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  filename: { color: "#FFF", fontWeight: "600", fontSize: 16, marginBottom: 4 },
  metaLine: { color: "#888", fontSize: 13 },
  textScroll: { flex: 1 },
  textContent: { padding: 16 },
  bodyText: { color: "#DDD", fontSize: 15, lineHeight: 24 },
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
    backgroundColor: "#1A1A1A",
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    gap: 4,
  },
  pressed: { opacity: 0.6 },
  actionIcon: { fontSize: 22 },
  actionLabel: { color: "#AAA", fontSize: 12 },
});
