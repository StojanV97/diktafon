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
import { t } from "../../src/i18n"

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
    if (!usePassword) {
      // Warn about unencrypted export
      Alert.alert(
        t('settings.backup.unencryptedTitle'),
        t('settings.backup.unencryptedMessage'),
        [
          { text: t('common.cancel'), style: "cancel", onPress: () => { setShowPasswordCreate(false); setPassword(""); setConfirmPassword("") } },
          {
            text: t('common.continue'),
            style: "destructive",
            onPress: async () => {
              setShowPasswordCreate(false)
              setBackupLoading(true)
              try {
                const uri = await backupService.createBackup(null)
                await Sharing.shareAsync(uri, { mimeType: "application/zip", UTI: "public.zip-archive" })
                setSnackbar(t('settings.backup.created'))
              } catch (e) {
                setSnackbar(safeErrorMessage(e, t('settings.backup.failed')))
              } finally {
                setBackupLoading(false)
                setPassword("")
                setConfirmPassword("")
              }
            },
          },
        ]
      )
      return
    }
    setShowPasswordCreate(false)
    setBackupLoading(true)
    try {
      const uri = await backupService.createBackup(password)
      await Sharing.shareAsync(uri, { mimeType: "application/octet-stream", UTI: "public.data" })
      setSnackbar(t('settings.backup.encryptedCreated'))
    } catch (e) {
      setSnackbar(safeErrorMessage(e, t('settings.backup.failed')))
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
      setSnackbar(safeErrorMessage(e, t('settings.backup.restoreFailed')))
    }
  }

  const doRestoreWithPassword = () => {
    setShowPasswordRestore(false)
    confirmRestore(restoreFileUri, password)
    setPassword("")
  }

  const confirmRestore = (fileUri, pw) => {
    Alert.alert(
      t('settings.backup.restoreTitle'),
      t('settings.backup.restoreMessage'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('common.continue'),
          style: "destructive",
          onPress: async () => {
            setBackupLoading(true)
            try {
              const stats = await backupService.restoreFromBackup(fileUri, pw)
              const msg = t('settings.backup.restored', { folders: stats.folders, entries: stats.entries, audioFiles: stats.audioFiles, textFiles: stats.textFiles })
              setSnackbar(
                stats.skippedFiles > 0
                  ? `${msg} ${t('settings.backup.restoreWarning', { skippedFiles: stats.skippedFiles })}`
                  : msg
              )
            } catch (e) {
              setSnackbar(safeErrorMessage(e, t('settings.backup.restoreFailed')))
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
        <Text style={styles.sectionTitle}>{t('settings.backup.title')}</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        <Text style={[typography.caption, { marginBottom: spacing.md }]}>
          {t('settings.backup.caption')}
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
              {t('settings.backup.passwordLabel')}
            </Text>
            <TextInput
              mode="outlined"
              label={t('settings.backup.passwordInput')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={{ marginBottom: spacing.sm }}
            />
            {password ? (
              <>
                <TextInput
                  mode="outlined"
                  label={t('settings.backup.confirmPassword')}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  style={{ marginBottom: spacing.sm }}
                />
                {confirmPassword !== "" && password !== confirmPassword && (
                  <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.sm }]}>
                    {t('settings.backup.passwordMismatch')}
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
                {password ? t('settings.backup.encryptAndSave') : t('settings.backup.saveUnencrypted')}
              </Button>
              <Button
                mode="outlined"
                onPress={() => { setShowPasswordCreate(false); setPassword(""); setConfirmPassword("") }}
                style={styles.btn}
              >
                {t('common.cancel')}
              </Button>
            </View>
          </View>
        )}

        {showPasswordRestore && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[typography.caption, { marginBottom: spacing.xs }]}>
              {t('settings.backup.decryptPasswordLabel')}
            </Text>
            <TextInput
              mode="outlined"
              label={t('settings.backup.passwordInput')}
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
                {t('settings.backup.decryptAndRestore')}
              </Button>
              <Button
                mode="outlined"
                onPress={() => { setShowPasswordRestore(false); setPassword(""); setRestoreFileUri(null) }}
                style={styles.btn}
              >
                {t('common.cancel')}
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
              {t('settings.backup.createButton')}
            </Button>
            <Button
              mode="outlined"
              onPress={handleRestoreBackup}
              disabled={backupLoading}
              icon="upload"
              style={styles.btn}
            >
              {t('settings.backup.restoreButton')}
            </Button>
          </View>
        )}
      </View>
    </View>
  )
}
