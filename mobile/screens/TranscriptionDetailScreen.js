import React, { useEffect, useState } from "react";
import {
  Clipboard,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  IconButton,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper";
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
  const theme = useTheme();
  const { id } = route.params;
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [snackbar, setSnackbar] = useState("");

  useEffect(() => {
    fetchTranscription(id)
      .then(setRecord)
      .catch((e) => setSnackbar(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const copyText = () => {
    if (!record?.text) return;
    Clipboard.setString(record.text);
    setSnackbar("Tekst je kopiran u clipboard.");
  };

  const shareText = async () => {
    if (!record?.text) return;
    try {
      await Share.share({ message: record.text, title: record.filename });
    } catch {
      // user dismissed
    }
  };

  const downloadTxt = async () => {
    setDownloading(true);
    try {
      const url = downloadUrl(id);
      const safeName = record.filename.replace(/\.[^.]+$/, "") + "_transkript.txt";
      const localPath = FileSystem.documentDirectory + safeName;

      const downloadResumable = FileSystem.createDownloadResumable(url, localPath);
      const { uri } = await downloadResumable.downloadAsync();

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "text/plain", UTI: "public.plain-text" });
      } else {
        setSnackbar(`Fajl sačuvan: ${uri}`);
      }
    } catch (e) {
      setSnackbar(e.message);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={styles.errorText}>Transkript nije pronađen.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.meta}>
        <Text variant="titleMedium" style={styles.filename}>{record.filename}</Text>
        <Text variant="bodySmall" style={styles.metaLine}>
          {formatDate(record.created_at)}
          {record.duration_seconds > 0 && `  •  ${formatDuration(record.duration_seconds)}`}
        </Text>
      </View>

      <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
        <Text variant="bodyMedium" style={styles.bodyText} selectable>
          {record.text}
        </Text>
      </ScrollView>

      <View style={styles.actions}>
        <IconButton
          icon="content-copy"
          iconColor="#AAA"
          size={24}
          onPress={copyText}
        />
        <Text variant="labelSmall" style={styles.actionDivider}>|</Text>
        <IconButton
          icon="share-variant"
          iconColor="#AAA"
          size={24}
          onPress={shareText}
        />
        <Text variant="labelSmall" style={styles.actionDivider}>|</Text>
        {downloading ? (
          <ActivityIndicator size="small" style={styles.downloadSpinner} />
        ) : (
          <IconButton
            icon="download"
            iconColor="#AAA"
            size={24}
            onPress={downloadTxt}
          />
        )}
      </View>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={2000}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: "#AAA" },
  meta: {
    backgroundColor: "#1A1A1A",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  filename: { color: "#FFF", fontWeight: "600", marginBottom: 4 },
  metaLine: { color: "#888" },
  textScroll: { flex: 1 },
  textContent: { padding: 16 },
  bodyText: { color: "#DDD", lineHeight: 24 },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
    backgroundColor: "#1A1A1A",
    paddingVertical: 4,
  },
  actionDivider: { color: "#2A2A2A" },
  downloadSpinner: { margin: 12 },
});
