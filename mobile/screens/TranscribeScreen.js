import React, { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
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
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [progress, setProgress] = useState(0);

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
      Alert.alert("Greška", e.message);
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
      setTimeout(() => navigation.navigate("Home"), 800);
    } catch (e) {
      setStatus("error");
      Alert.alert("Transkript nije uspeo", e.message);
    }
  };

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(1) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Novi transkript</Text>

      <Pressable
        style={({ pressed }) => [styles.picker, pressed && styles.pressed]}
        onPress={pickFile}
      >
        <Text style={styles.pickerIcon}>🎵</Text>
        <Text style={styles.pickerLabel}>
          {file ? file.name : "Odaberi audio fajl"}
        </Text>
        {fileSizeMB && (
          <Text style={styles.pickerMeta}>{fileSizeMB} MB</Text>
        )}
      </Pressable>

      {file && status === "idle" && (
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
          onPress={transcribe}
        >
          <Text style={styles.btnText}>Transkribuj</Text>
        </Pressable>
      )}

      {status === "uploading" && (
        <View style={styles.statusBox}>
          <ActivityIndicator size="large" color="#4A9EFF" />
          <Text style={styles.statusText}>
            {progress < 0.5
              ? "Učitavam fajl..."
              : "Transkribovanje u toku...\nOvo može trajati nekoliko minuta."}
          </Text>
        </View>
      )}

      {status === "done" && (
        <View style={styles.statusBox}>
          <Text style={styles.doneText}>Transkript sačuvan!</Text>
        </View>
      )}

      {status === "error" && (
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnRetry, pressed && styles.pressed]}
          onPress={transcribe}
        >
          <Text style={styles.btnText}>Pokušaj ponovo</Text>
        </Pressable>
      )}

      <Text style={styles.hint}>
        Podržani formati: MP3, MP4, WAV, M4A, OGG, FLAC, AAC{"\n"}
        Maksimalna dužina: ~1 sat
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", padding: 20, justifyContent: "center" },
  title: { color: "#FFF", fontSize: 22, fontWeight: "700", marginBottom: 30, textAlign: "center" },
  picker: {
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
    borderStyle: "dashed",
  },
  pressed: { opacity: 0.7 },
  pickerIcon: { fontSize: 40, marginBottom: 10 },
  pickerLabel: { color: "#CCC", fontSize: 15, textAlign: "center" },
  pickerMeta: { color: "#666", fontSize: 12, marginTop: 4 },
  btn: {
    backgroundColor: "#4A9EFF",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginBottom: 20,
  },
  btnRetry: { backgroundColor: "#FF6B6B" },
  btnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  statusBox: { alignItems: "center", paddingVertical: 30, gap: 16 },
  statusText: { color: "#AAA", fontSize: 14, textAlign: "center", lineHeight: 22 },
  doneText: { color: "#4AFF8C", fontSize: 18, fontWeight: "600" },
  hint: { color: "#555", fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 20 },
});
