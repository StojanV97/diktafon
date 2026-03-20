import React, { useState } from "react"
import { Alert, View } from "react-native"
import { ActivityIndicator, Button, Divider, Text, TextInput } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import * as Sharing from "expo-sharing"
import * as DocumentPicker from "expo-document-picker"
import * as backupService from "../../services/backupService"
import { safeErrorMessage } from "../../utils/errorHelpers"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"

export default function BackupSection({ setSnackbar }) {
  const [backupLoading, setBackupLoading] = useState(false)
  const [showPasswordCreate, setShowPasswordCreate] = useState(false)
  const [showPasswordRestore, setShowPasswordRestore] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [restoreFileUri, setRestoreFileUri] = useState(null)

  const handleCreateBackup = () => {
    setPassword("")
    setConfirmPassword("")
    setShowPasswordCreate(true)
  }

  const doCreateBackup = async (usePassword) => {
    setShowPasswordCreate(false)
    setBackupLoading(true)
    try {
      const pw = usePassword ? password : null
      const uri = await backupService.createBackup(pw)
      const mimeType = pw ? "application/octet-stream" : "application/zip"
      const UTI = pw ? "public.data" : "public.zip-archive"
      await Sharing.shareAsync(uri, { mimeType, UTI })
      setSnackbar(pw ? "Sifrovan backup je kreiran." : "Backup je kreiran.")
    } catch (e) {
      setSnackbar(safeErrorMessage(e, "Backup nije uspeo."))
    } finally {
      setBackupLoading(false)
      setPassword("")
      setConfirmPassword("")
    }
  }

  const handleRestoreBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/octet-stream"],
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const fileUri = result.assets[0].uri
      const fileName = result.assets[0].name || ""

      if (fileName.endsWith(".enc")) {
        setRestoreFileUri(fileUri)
        setPassword("")
        setShowPasswordRestore(true)
      } else {
        confirmRestore(fileUri, null)
      }
    } catch (e) {
      setSnackbar(safeErrorMessage(e, "Oporavak nije uspeo."))
    }
  }

  const doRestoreWithPassword = () => {
    setShowPasswordRestore(false)
    confirmRestore(restoreFileUri, password)
    setPassword("")
  }

  const confirmRestore = (fileUri, pw) => {
    Alert.alert(
      "Oporavak iz backup-a",
      "Ovo ce zameniti sve trenutne podatke. Nastaviti?",
      [
        { text: "Otkazi", style: "cancel" },
        {
          text: "Nastavi",
          style: "destructive",
          onPress: async () => {
            setBackupLoading(true)
            try {
              const stats = await backupService.restoreFromBackup(fileUri, pw)
              const msg = `Oporavak zavrsen: ${stats.folders} fascikli, ${stats.entries} unosa, ${stats.audioFiles} snimaka, ${stats.textFiles} transkripata.`
              setSnackbar(
                stats.skippedFiles > 0
                  ? `${msg} Upozorenje: ${stats.skippedFiles} fajlova nije moglo biti ucitano.`
                  : msg
              )
            } catch (e) {
              setSnackbar(safeErrorMessage(e, "Oporavak nije uspeo."))
            } finally {
              setBackupLoading(false)
            }
          },
        },
      ]
    )
  }

  return (
    <View style={styles.section}>
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

        {showPasswordCreate && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[typography.caption, { marginBottom: spacing.xs }]}>
              Unesi lozinku za sifrovanje backup-a (opciono):
            </Text>
            <TextInput
              mode="outlined"
              label="Lozinka"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={{ marginBottom: spacing.sm }}
            />
            {password ? (
              <>
                <TextInput
                  mode="outlined"
                  label="Potvrdi lozinku"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  style={{ marginBottom: spacing.sm }}
                />
                {confirmPassword !== "" && password !== confirmPassword && (
                  <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.sm }]}>
                    Lozinke se ne poklapaju.
                  </Text>
                )}
              </>
            ) : null}
            <View style={styles.btnRow}>
              <Button
                mode="contained"
                onPress={() => doCreateBackup(!!password)}
                buttonColor={colors.primary}
                style={styles.btn}
                disabled={!!password && password !== confirmPassword}
              >
                {password ? "Sifruj i sacuvaj" : "Sacuvaj bez sifre"}
              </Button>
              <Button
                mode="outlined"
                onPress={() => { setShowPasswordCreate(false); setPassword(""); setConfirmPassword("") }}
                style={styles.btn}
              >
                Otkazi
              </Button>
            </View>
          </View>
        )}

        {showPasswordRestore && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[typography.caption, { marginBottom: spacing.xs }]}>
              Unesi lozinku za desifrovanje backup-a:
            </Text>
            <TextInput
              mode="outlined"
              label="Lozinka"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={{ marginBottom: spacing.sm }}
            />
            <View style={styles.btnRow}>
              <Button
                mode="contained"
                onPress={doRestoreWithPassword}
                buttonColor={colors.primary}
                disabled={!password}
                style={styles.btn}
              >
                Desifruj i oporavi
              </Button>
              <Button
                mode="outlined"
                onPress={() => { setShowPasswordRestore(false); setPassword(""); setRestoreFileUri(null) }}
                style={styles.btn}
              >
                Otkazi
              </Button>
            </View>
          </View>
        )}

        {!showPasswordCreate && !showPasswordRestore && (
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
        )}
      </View>
    </View>
  )
}
