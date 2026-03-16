import React, { useState } from "react";
import {
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  IconButton,
  ProgressBar,
  Snackbar,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import * as DocumentPicker from "expo-document-picker";
import { uploadAndTranscribe } from "../services/api";

const AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/x-m4a",
  "audio/webm",
  "audio/*",
];

export default function TranscribeScreen({ navigation }) {
  const theme = useTheme();
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [progress, setProgress] = useState(0);
  const [snackbar, setSnackbar] = useState("");

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      setFile(asset);
      setStatus("idle");
    } catch (e) {
      setSnackbar(e.message);
    }
  };

  const transcribe = async () => {
    if (!file) return;
    setStatus("uploading");
    setProgress(0);

    try {
      await uploadAndTranscribe(
        file.uri,
        file.name,
        file.mimeType,
        setProgress
      );
      setStatus("done");
      setSnackbar("Transkript sačuvan!");
      setTimeout(() => navigation.navigate("Home"), 800);
    } catch (e) {
      setStatus("error");
      setSnackbar("Transkript nije uspeo: " + e.message);
    }
  };

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(1) : null;

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>Novi transkript</Text>

      <Surface style={styles.picker} onTouchEnd={pickFile}>
        <IconButton
          icon="file-music-outline"
          size={40}
          iconColor={theme.colors.primary}
        />
        <Text variant="bodyMedium" style={styles.pickerLabel}>
          {file ? file.name : "Odaberi audio fajl"}
        </Text>
        {fileSizeMB && (
          <Text variant="bodySmall" style={styles.pickerMeta}>{fileSizeMB} MB</Text>
        )}
      </Surface>

      {file && status === "idle" && (
        <Button
          mode="contained"
          onPress={transcribe}
          style={styles.btn}
          labelStyle={styles.btnLabel}
        >
          Transkribuj
        </Button>
      )}

      {status === "uploading" && (
        <View style={styles.statusBox}>
          <ProgressBar
            progress={progress}
            color={theme.colors.primary}
            style={styles.progressBar}
          />
          <ActivityIndicator size="large" style={styles.spinner} />
          <Text variant="bodyMedium" style={styles.statusText}>
            {progress < 0.5
              ? "Učitavam fajl..."
              : "Transkribovanje u toku...\nOvo može trajati nekoliko minuta."}
          </Text>
        </View>
      )}

      {status === "done" && (
        <View style={styles.statusBox}>
          <Text variant="titleMedium" style={styles.doneText}>Transkript sačuvan!</Text>
        </View>
      )}

      {status === "error" && (
        <Button
          mode="contained"
          onPress={transcribe}
          buttonColor={theme.colors.error}
          style={styles.btn}
          labelStyle={styles.btnLabel}
        >
          Pokušaj ponovo
        </Button>
      )}

      <Text variant="bodySmall" style={styles.hint}>
        Podržani formati: MP3, MP4, WAV, M4A, OGG, FLAC, AAC{"\n"}
        Maksimalna dužina: ~1 sat
      </Text>

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
  container: { flex: 1, padding: 20, justifyContent: "center" },
  title: { color: "#FFF", fontWeight: "700", marginBottom: 30, textAlign: "center" },
  picker: {
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
    borderStyle: "dashed",
    backgroundColor: "#1E1E1E",
  },
  pickerLabel: { color: "#CCC", textAlign: "center" },
  pickerMeta: { color: "#666", marginTop: 4 },
  btn: {
    marginBottom: 20,
    backgroundColor: "#4A9EFF",
  },
  btnLabel: { fontSize: 16, fontWeight: "600", paddingVertical: 4 },
  statusBox: { alignItems: "center", paddingVertical: 30, gap: 16 },
  progressBar: { width: "100%", height: 6, borderRadius: 3 },
  spinner: { marginTop: 8 },
  statusText: { color: "#AAA", textAlign: "center", lineHeight: 22 },
  doneText: { color: "#4AFF8C", fontWeight: "600" },
  hint: { color: "#555", textAlign: "center", lineHeight: 18, marginTop: 20 },
});
