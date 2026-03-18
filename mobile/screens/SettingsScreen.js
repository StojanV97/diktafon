import React, { useCallback, useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Dialog,
  Divider,
  Portal,
  ProgressBar,
  RadioButton,
  Snackbar,
  Switch,
  Text,
  TextInput,
  TouchableRipple,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as whisperService from "../services/whisperService";
import * as assemblyAIService from "../services/assemblyAIService";
import * as backupService from "../services/backupService";
import { fetchFolders, getFolder } from "../services/journalStorage";
import { getSettings, updateSettings } from "../services/settingsService";
import { getUser, signOut } from "../services/authService";
import { isICloudAvailable, enableSync, disableSync, getSyncStatus } from "../services/icloudSyncService";
import { isPremium, getOfferings, purchasePackage, restorePurchases, getUsageFromProfile } from "../services/subscriptionService";
import { getProfile } from "../services/authService";
import { colors, spacing, radii, elevation, typography } from "../theme";

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function SettingsScreen({ navigation }) {
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

  // Auto-move
  const [autoMoveFolder, setAutoMoveFolder] = useState(null);
  const [autoMoveFolders, setAutoMoveFolders] = useState([]);
  const [autoMoveDialogVisible, setAutoMoveDialogVisible] = useState(false);
  const [keepAudioOnMove, setKeepAudioOnMove] = useState(false);

  // Backup
  const [backupLoading, setBackupLoading] = useState(false);

  // Account
  const [user, setUser] = useState(null);

  // iCloud sync
  const [icloudAvailable, setIcloudAvailable] = useState(false);
  const [icloudSyncOn, setIcloudSyncOn] = useState(false);

  // Subscription
  const [premium, setPremium] = useState(false);
  const [usageInfo, setUsageInfo] = useState(null);
  const [offerings, setOfferings] = useState(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  const [snackbar, setSnackbar] = useState("");

  const loadSettings = useCallback(async () => {
    setModelStatus(whisperService.getModelStatus());
    const key = (await assemblyAIService.getApiKey()) || "";
    setApiKey(key);
    setSavedKey(key);

    const settings = await getSettings();
    setDefaultEngine(settings.defaultEngine);
    setKeepAudioOnMove(settings.autoMoveKeepAudio);
    setIcloudSyncOn(settings.icloudSyncEnabled);

    if (settings.autoMoveFolderId) {
      const folder = await getFolder(settings.autoMoveFolderId);
      if (folder) {
        setAutoMoveFolder({ id: folder.id, name: folder.name, color: folder.color });
      } else {
        await updateSettings({ autoMoveFolderId: null, autoMoveFolderName: null });
      }
    }

    // Load auth state
    let currentUser = null;
    try {
      currentUser = await getUser();
      setUser(currentUser);
    } catch { setUser(null); }

    // Check iCloud availability
    if (Platform.OS === "ios") {
      const available = await isICloudAvailable();
      setIcloudAvailable(available);
    }

    // Check subscription
    try {
      const hasPremium = await isPremium();
      setPremium(hasPremium);
      if (currentUser) {
        const profile = await getProfile();
        setUsageInfo(getUsageFromProfile(profile));
      }
    } catch { /* ignore */ }

    // Load offerings
    try {
      const off = await getOfferings();
      setOfferings(off);
    } catch { /* ignore */ }
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
    await updateSettings({ defaultEngine: value });
  };

  const handleOpenAutoMoveDialog = async () => {
    const allFolders = await fetchFolders();
    setAutoMoveFolders(allFolders.filter((f) => !f.is_daily_log));
    setAutoMoveDialogVisible(true);
  };

  const handleSelectAutoMoveFolder = async (folder) => {
    await updateSettings({ autoMoveFolderId: folder.id, autoMoveFolderName: folder.name });
    setAutoMoveFolder({ id: folder.id, name: folder.name, color: folder.color });
    setAutoMoveDialogVisible(false);
    setSnackbar(`Automatsko premestanje: ${folder.name}`);
  };

  const handleClearAutoMove = async () => {
    await updateSettings({ autoMoveFolderId: null, autoMoveFolderName: null });
    setAutoMoveFolder(null);
    setSnackbar("Automatsko premestanje iskljuceno.");
  };

  const handleToggleKeepAudio = async (value) => {
    setKeepAudioOnMove(value);
    await updateSettings({ autoMoveKeepAudio: value });
  };

  // ── Account handlers ──────────────────────────────────

  const handleSignIn = () => {
    navigation.navigate("Auth");
  };

  const handleSignOut = async () => {
    Alert.alert(
      "Odjava",
      "Da li zelis da se odjavis?",
      [
        { text: "Otkazi", style: "cancel" },
        {
          text: "Odjavi se",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut();
              setUser(null);
              setPremium(false);
              setUsageInfo(null);
              setSnackbar("Uspesno si se odjavio/la.");
            } catch (e) {
              setSnackbar("Odjava nije uspela: " + e.message);
            }
          },
        },
      ]
    );
  };

  // ── iCloud sync handlers ─────────────────────────────

  const handleToggleICloudSync = async (value) => {
    setIcloudSyncOn(value);
    await updateSettings({ icloudSyncEnabled: value });
    if (value) {
      await enableSync();
      setSnackbar("iCloud sinhronizacija ukljucena.");
    } else {
      await disableSync();
      setSnackbar("iCloud sinhronizacija iskljucena.");
    }
  };

  // ── Subscription handlers ────────────────────────────

  const handlePurchase = async (pkg) => {
    setPurchaseLoading(true);
    try {
      const result = await purchasePackage(pkg);
      setPremium(result);
      if (result) setSnackbar("Premium je aktiviran!");
    } catch (e) {
      if (e.userCancelled) return;
      setSnackbar("Kupovina nije uspela: " + e.message);
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleRestore = async () => {
    setPurchaseLoading(true);
    try {
      const result = await restorePurchases();
      setPremium(result);
      setSnackbar(result ? "Premium je obnovljen!" : "Nema prethodnih kupovina.");
    } catch (e) {
      setSnackbar("Obnova nije uspela: " + e.message);
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const uri = await backupService.createBackup();
      await Sharing.shareAsync(uri, {
        mimeType: "application/zip",
        UTI: "public.zip-archive",
      });
      setSnackbar("Backup je kreiran.");
    } catch (e) {
      setSnackbar("Backup nije uspeo: " + e.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/zip",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const fileUri = result.assets[0].uri;

      Alert.alert(
        "Oporavak iz backup-a",
        "Ovo ce zameniti sve trenutne podatke. Nastaviti?",
        [
          { text: "Otkazi", style: "cancel" },
          {
            text: "Nastavi",
            style: "destructive",
            onPress: async () => {
              setBackupLoading(true);
              try {
                const stats = await backupService.restoreFromBackup(fileUri);
                setSnackbar(
                  `Oporavak zavrsen: ${stats.folders} fascikli, ${stats.entries} unosa, ${stats.audioFiles} snimaka, ${stats.textFiles} transkripata.`
                );
              } catch (e) {
                setSnackbar("Oporavak nije uspeo: " + e.message);
              } finally {
                setBackupLoading(false);
              }
            },
          },
        ]
      );
    } catch (e) {
      setSnackbar("Oporavak nije uspeo: " + e.message);
    }
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
              Besplatno · Radi offline · ~466 MB · Sporije, slabiji kvalitet za srpski
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
              Brze · Bolji kvalitet · Zahteva API kljuc
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

        {/* Section 4: Brzi Zapis auto-move */}
        <View style={[styles.section, elevation.sm]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="folder-move-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Brzi Zapis</Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.sectionBody}>
            <Text style={[typography.caption, { marginBottom: spacing.md }]}>
              Automatski premesti zavrsene zapise u izabrani folder.
            </Text>
            <View style={styles.autoMoveStatus}>
              {autoMoveFolder ? (
                <View style={styles.autoMoveFolderInfo}>
                  <View style={[styles.autoMoveDot, { backgroundColor: autoMoveFolder.color || colors.primary }]} />
                  <Text style={typography.body}>{autoMoveFolder.name}</Text>
                </View>
              ) : (
                <Text style={[typography.body, { color: colors.muted }]}>Iskljuceno</Text>
              )}
            </View>
            <View style={styles.btnRow}>
              <Button
                mode="contained"
                onPress={handleOpenAutoMoveDialog}
                buttonColor={colors.primary}
                style={styles.btn}
              >
                Izaberi folder
              </Button>
              {autoMoveFolder && (
                <Button
                  mode="outlined"
                  onPress={handleClearAutoMove}
                  textColor={colors.danger}
                  style={styles.btn}
                >
                  Iskljuci
                </Button>
              )}
            </View>
            {autoMoveFolder && (
              <TouchableRipple
                onPress={() => handleToggleKeepAudio(!keepAudioOnMove)}
                style={styles.toggleRow}
              >
                <View style={styles.toggleRowInner}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>Sacuvaj snimke pri premestanju</Text>
                    <Text style={[typography.caption, { marginTop: 2 }]}>
                      Podrazumevano se brisu snimci, cuva se samo transkript
                    </Text>
                  </View>
                  <Switch
                    value={keepAudioOnMove}
                    onValueChange={handleToggleKeepAudio}
                    color={colors.primary}
                  />
                </View>
              </TouchableRipple>
            )}
          </View>
        </View>

        {/* Section 5: Backup & Restore */}
        <View style={[styles.section, elevation.sm]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Backup i oporavak</Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.sectionBody}>
            <Text style={[typography.caption, { marginBottom: spacing.md }]}>
              Sacuvaj ili oporavi sve fascikle, snimke i transkripte.
            </Text>
            {backupLoading && (
              <ActivityIndicator
                animating
                color={colors.primary}
                style={{ marginBottom: spacing.md }}
              />
            )}
            <View style={styles.btnColumn}>
              <Button
                mode="contained"
                onPress={handleCreateBackup}
                loading={backupLoading}
                disabled={backupLoading}
                buttonColor={colors.primary}
                icon="download"
                style={styles.btn}
              >
                Kreiraj backup
              </Button>
              <Button
                mode="outlined"
                onPress={handleRestoreBackup}
                disabled={backupLoading}
                icon="upload"
                style={styles.btn}
              >
                Oporavi iz backup-a
              </Button>
            </View>
          </View>
        </View>
        {/* Section 6: Nalog (Account) */}
        <View style={[styles.section, elevation.sm]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="account-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Nalog</Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.sectionBody}>
            {user ? (
              <>
                <Text style={typography.body}>
                  Prijavljen kao:{" "}
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                    {user.email || "Apple ID"}
                  </Text>
                </Text>
                <View style={styles.btnRow}>
                  <Button
                    mode="outlined"
                    onPress={handleSignOut}
                    textColor={colors.danger}
                    style={styles.btn}
                  >
                    Odjavi se
                  </Button>
                </View>
              </>
            ) : (
              <>
                <Text style={[typography.body, { color: colors.muted, marginBottom: spacing.md }]}>
                  Prijavi se za cloud backup, sinhronizaciju i premium funkcije.
                </Text>
                <Button
                  mode="contained"
                  onPress={handleSignIn}
                  buttonColor={colors.primary}
                  icon="login"
                  style={styles.btn}
                >
                  Prijavi se
                </Button>
              </>
            )}
          </View>
        </View>

        {/* Section 7: iCloud Sync (iOS only) */}
        {Platform.OS === "ios" && (
          <View style={[styles.section, elevation.sm]}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="cloud-sync-outline" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>iCloud sinhronizacija</Text>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.sectionBody}>
              <Text style={[typography.caption, { marginBottom: spacing.md }]}>
                Automatski sacuvaj i sinhronizuj sve podatke preko iCloud-a. Besplatno.
              </Text>
              {!icloudAvailable ? (
                <Text style={[typography.body, { color: colors.warning }]}>
                  iCloud nije dostupan. Proveri da li si prijavljen u iCloud podesavanjima.
                </Text>
              ) : (
                <TouchableRipple
                  onPress={() => handleToggleICloudSync(!icloudSyncOn)}
                  style={styles.toggleRow}
                >
                  <View style={styles.toggleRowInner}>
                    <View style={{ flex: 1 }}>
                      <Text style={typography.body}>Sinhronizacija ukljucena</Text>
                      <Text style={[typography.caption, { marginTop: 2 }]}>
                        Fascikle, zapisi i transkripti se cuvaju u iCloud-u
                      </Text>
                    </View>
                    <Switch
                      value={icloudSyncOn}
                      onValueChange={handleToggleICloudSync}
                      color={colors.primary}
                    />
                  </View>
                </TouchableRipple>
              )}
            </View>
          </View>
        )}

        {/* Section 8: Pretplata (Subscription) */}
        <View style={[styles.section, elevation.sm]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="star-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Pretplata</Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.sectionBody}>
            {premium ? (
              <>
                <View style={styles.premiumBadge}>
                  <MaterialCommunityIcons name="check-decagram" size={20} color={colors.success} />
                  <Text style={[typography.body, { marginLeft: spacing.sm, fontFamily: "Inter_600SemiBold" }]}>
                    Diktafon Premium
                  </Text>
                </View>
                {usageInfo && (
                  <View style={{ marginTop: spacing.md }}>
                    <Text style={typography.body}>
                      AssemblyAI transkripcija: {usageInfo.used} / {usageInfo.limit} min ovog meseca
                    </Text>
                    <ProgressBar
                      progress={usageInfo.used / usageInfo.limit}
                      color={usageInfo.remaining > 20 ? colors.primary : colors.warning}
                      style={[styles.progressBar, { marginTop: spacing.sm }]}
                    />
                    <Text style={[typography.caption, { marginTop: spacing.xs }]}>
                      Preostalo: {usageInfo.remaining} min
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={[typography.body, { marginBottom: spacing.md }]}>
                  Otključaj AssemblyAI cloud transkripciju sa prepoznavanjem govornika.
                </Text>
                <Text style={[typography.caption, { marginBottom: spacing.lg }]}>
                  120 min/mesec cloud transkripcije · Visa tacnost · Prepoznavanje govornika
                </Text>
                {offerings?.availablePackages?.map((pkg) => (
                  <Button
                    key={pkg.identifier}
                    mode="contained"
                    onPress={() => handlePurchase(pkg)}
                    loading={purchaseLoading}
                    disabled={purchaseLoading}
                    buttonColor={colors.primary}
                    style={[styles.btn, { marginBottom: spacing.sm }]}
                  >
                    {pkg.product.title} — {pkg.product.priceString}
                  </Button>
                ))}
                <Button
                  mode="text"
                  onPress={handleRestore}
                  disabled={purchaseLoading}
                  textColor={colors.muted}
                  style={styles.btn}
                >
                  Obnovi kupovinu
                </Button>
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <Portal>
        <Dialog
          visible={autoMoveDialogVisible}
          onDismiss={() => setAutoMoveDialogVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={typography.heading}>Izaberi folder</Dialog.Title>
          <Dialog.Content>
            {autoMoveFolders.length === 0 ? (
              <Text style={typography.body}>Nema dostupnih foldera.</Text>
            ) : (
              autoMoveFolders.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  style={styles.folderRow}
                  onPress={() => handleSelectAutoMoveFolder(folder)}
                >
                  <View style={[styles.folderDot, { backgroundColor: folder.color || colors.primary }]} />
                  <Text style={[typography.body, { flex: 1 }]}>{folder.name}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
                </TouchableOpacity>
              ))
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAutoMoveDialogVisible(false)} textColor={colors.muted}>
              Otkazi
            </Button>
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
  btnColumn: {
    gap: spacing.sm,
  },

  input: { backgroundColor: colors.surface },

  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  radioInfo: { flex: 1, paddingLeft: spacing.xs },

  autoMoveStatus: {
    marginBottom: spacing.md,
  },
  autoMoveFolderInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  autoMoveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },

  toggleRow: {
    marginTop: spacing.md,
  },
  toggleRowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.successLight,
    padding: spacing.md,
    borderRadius: radii.sm,
  },

  dialog: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  folderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },
});
