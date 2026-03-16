import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Divider,
  ProgressBar,
  RadioButton,
  Snackbar,
  Text,
  TextInput,
  TouchableRipple,
} from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as whisperService from "../services/whisperService";
import * as assemblyAIService from "../services/assemblyAIService";
import { colors, spacing, radii, elevation, typography } from "../theme";

const ENGINE_STORAGE_KEY = "default_transcription_engine";

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function SettingsScreen() {
  // Whisper model
  const [modelStatus, setModelStatus] = useState(whisperService.getModelStatus());
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // AssemblyAI
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Default engine
  const [defaultEngine, setDefaultEngine] = useState("local");

  const [snackbar, setSnackbar] = useState("");

  const loadSettings = useCallback(async () => {
    setModelStatus(whisperService.getModelStatus());
    const key = (await assemblyAIService.getApiKey()) || "";
    setApiKey(key);
    setSavedKey(key);
    const engine = (await AsyncStorage.getItem(ENGINE_STORAGE_KEY)) || "local";
    setDefaultEngine(engine);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleDownloadModel = async () => {
    setDownloading(true);
    setDownloadProgress(0);
    try {
      await whisperService.downloadModel((progress) => {
        setDownloadProgress(progress);
      });
      setModelStatus(whisperService.getModelStatus());
      setSnackbar("Model je uspesno preuzet.");
    } catch (e) {
      setSnackbar("Preuzimanje nije uspelo: " + e.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteModel = () => {
    whisperService.deleteModel();
    setModelStatus(whisperService.getModelStatus());
    setSnackbar("Model je obrisan.");
  };

  const handleSaveKey = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    await assemblyAIService.setApiKey(trimmed);
    setSavedKey(trimmed);
    setSnackbar("API kljuc je sacuvan.");
  };

  const handleDeleteKey = async () => {
    await assemblyAIService.removeApiKey();
    setApiKey("");
    setSavedKey("");
    setSnackbar("API kljuc je obrisan.");
  };

  const handleEngineChange = async (value) => {
    setDefaultEngine(value);
    await AsyncStorage.setItem(ENGINE_STORAGE_KEY, value);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Section 1: Whisper Model */}
        <View style={[styles.section, elevation.sm]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="brain" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Whisper model</Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.sectionBody}>
            <Text style={typography.body}>
              Status:{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                {modelStatus.downloaded
                  ? `Preuzet (${formatBytes(modelStatus.sizeBytes)})`
                  : "Nije preuzet"}
              </Text>
            </Text>
            <Text style={[typography.caption, { marginTop: spacing.xs }]}>
              Model za transkripciju na uredjaju (~141 MB). Preuzima se jednom.
            </Text>
            {downloading && (
              <View style={{ marginTop: spacing.md }}>
                <ProgressBar
                  progress={downloadProgress}
                  color={colors.primary}
                  style={styles.progressBar}
                />
                <Text style={[typography.caption, { marginTop: spacing.xs, textAlign: "center" }]}>
                  {Math.round(downloadProgress * 100)}%
                </Text>
              </View>
            )}
            <View style={styles.btnRow}>
              {modelStatus.downloaded ? (
                <Button
                  mode="outlined"
                  onPress={handleDeleteModel}
                  textColor={colors.danger}
                  style={styles.btn}
                >
                  Obrisi model
                </Button>
              ) : (
                <Button
                  mode="contained"
                  onPress={handleDownloadModel}
                  loading={downloading}
                  disabled={downloading}
                  buttonColor={colors.primary}
                  style={styles.btn}
                >
                  Preuzmi model
                </Button>
              )}
            </View>
          </View>
        </View>

        {/* Section 2: AssemblyAI */}
        <View style={[styles.section, elevation.sm]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="cloud-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>AssemblyAI</Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.sectionBody}>
            <TextInput
              label="API kljuc"
              value={apiKey}
              onChangeText={setApiKey}
              mode="outlined"
              secureTextEntry={!showKey}
              right={
                <TextInput.Icon
                  icon={showKey ? "eye-off" : "eye"}
                  onPress={() => setShowKey(!showKey)}
                />
              }
              style={styles.input}
              outlineColor={colors.borderGhost}
              activeOutlineColor={colors.primary}
            />
            <Text style={[typography.caption, { marginTop: spacing.xs }]}>
              assemblyai.com za API kljuc
            </Text>
            <View style={styles.btnRow}>
              <Button
                mode="contained"
                onPress={handleSaveKey}
                disabled={!apiKey.trim() || apiKey.trim() === savedKey}
                buttonColor={colors.primary}
                style={styles.btn}
              >
                Sacuvaj
              </Button>
              {savedKey ? (
                <Button
                  mode="outlined"
                  onPress={handleDeleteKey}
                  textColor={colors.danger}
                  style={styles.btn}
                >
                  Obrisi kljuc
                </Button>
              ) : null}
            </View>
          </View>
        </View>

        {/* Section 3: Default Engine */}
        <View style={[styles.section, elevation.sm]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="cog-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Podrazumevani motor</Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.sectionBody}>
            <RadioButton.Group onValueChange={handleEngineChange} value={defaultEngine}>
              <TouchableRipple onPress={() => handleEngineChange("local")}>
                <View style={styles.radioRow}>
                  <RadioButton value="local" color={colors.primary} />
                  <View style={styles.radioInfo}>
                    <Text style={typography.body}>Na uredjaju (privatno)</Text>
                    <Text style={[typography.caption, { marginTop: 2 }]}>
                      Whisper AI, bez interneta
                    </Text>
                  </View>
                </View>
              </TouchableRipple>
              <TouchableRipple onPress={() => handleEngineChange("assemblyai")}>
                <View style={styles.radioRow}>
                  <RadioButton value="assemblyai" color={colors.primary} />
                  <View style={styles.radioInfo}>
                    <Text style={typography.body}>AssemblyAI (oblak)</Text>
                    <Text style={[typography.caption, { marginTop: 2 }]}>
                      Visa tacnost, prepoznavanje govornika
                    </Text>
                  </View>
                </View>
              </TouchableRipple>
            </RadioButton.Group>
          </View>
        </View>
      </ScrollView>

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
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 40 },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.foreground,
  },
  divider: { backgroundColor: colors.borderGhost },
  sectionBody: { padding: spacing.lg },

  progressBar: { height: 6, borderRadius: 3 },

  btnRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btn: { borderRadius: radii.sm },

  input: { backgroundColor: colors.surface },

  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  radioInfo: { flex: 1, paddingLeft: spacing.xs },
});
