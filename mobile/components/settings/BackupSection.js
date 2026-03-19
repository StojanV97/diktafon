import React, { useState } from "react"
import { Alert, View } from "react-native"
import { ActivityIndicator, Button, Divider, Text } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import * as Sharing from "expo-sharing"
import * as DocumentPicker from "expo-document-picker"
import * as backupService from "../../services/backupService"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"

export default function BackupSection({ setSnackbar }) {
  const [backupLoading, setBackupLoading] = useState(false)

  const handleCreateBackup = async () => {
    setBackupLoading(true)
    try {
      const uri = await backupService.createBackup()
      await Sharing.shareAsync(uri, {
        mimeType: "application/zip",
        UTI: "public.zip-archive",
      })
      setSnackbar("Backup je kreiran.")
    } catch (e) {
      setSnackbar("Backup nije uspeo: " + e.message)
    } finally {
      setBackupLoading(false)
    }
  }

  const handleRestoreBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/zip",
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const fileUri = result.assets[0].uri

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
                const stats = await backupService.restoreFromBackup(fileUri)
                const msg = `Oporavak zavrsen: ${stats.folders} fascikli, ${stats.entries} unosa, ${stats.audioFiles} snimaka, ${stats.textFiles} transkripata.`
                setSnackbar(
                  stats.skippedFiles > 0
                    ? `${msg} Upozorenje: ${stats.skippedFiles} fajlova nije moglo biti ucitano.`
                    : msg
                )
              } catch (e) {
                setSnackbar("Oporavak nije uspeo: " + e.message)
              } finally {
                setBackupLoading(false)
              }
            },
          },
        ]
      )
    } catch (e) {
      setSnackbar("Oporavak nije uspeo: " + e.message)
    }
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
  )
}
