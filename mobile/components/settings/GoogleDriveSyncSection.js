import React, { useEffect, useState } from "react"
import { Alert, Platform, View } from "react-native"
import { ActivityIndicator, Button, Divider, Switch, Text, TouchableRipple } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import {
  isGoogleDriveAvailable,
  signInToGoogle,
  signOutFromGoogle,
  isSignedIn,
  enableSync,
  disableSync,
  pullAndMerge,
  uploadAllExistingData,
} from "../../services/googleDriveSyncService"
import {
  getTombstonedEntries,
  getTombstonedFolders,
  reviveTombstonedRecords,
  getRawFolders,
  getRawEntries,
  overwriteFolders,
  overwriteEntries,
} from "../../services/journalStorage"
import { audioDir, textsDir } from "../../src/services/storage/storageCore"
import { getSettings, updateSettings } from "../../services/settingsService"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"
import { t } from "../../src/i18n"

export default function GoogleDriveSyncSection({ setSnackbar }) {
  const [signedIn, setSignedIn] = useState(false)
  const [email, setEmail] = useState("")
  const [syncOn, setSyncOn] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tombstoneCount, setTombstoneCount] = useState(0)

  const loadTombstoneCount = async () => {
    try {
      const [entries, folders] = await Promise.all([
        getTombstonedEntries(),
        getTombstonedFolders(),
      ])
      setTombstoneCount(entries.length + folders.length)
    } catch {}
  }

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const signed = await isSignedIn()
        if (!ignore) setSignedIn(signed)
        const settings = await getSettings()
        if (!ignore) {
          setSyncOn(settings.googleDriveSyncEnabled)
          setEmail(settings.googleDriveEmail)
        }
      } catch (e) {
        if (__DEV__) console.warn("Google Drive init failed:", e.message)
      }
      if (!ignore) await loadTombstoneCount()
    })()
    return () => { ignore = true }
  }, [])

  if (Platform.OS !== "android") return null

  const handleSignIn = async () => {
    setSigningIn(true)
    try {
      const result = await signInToGoogle()
      if (result) {
        setSignedIn(true)
        setEmail(result.email)
        setSnackbar(t('settings.googleDrive.signedIn'))
      } else {
        setSnackbar(t('settings.googleDrive.signInFailed'))
      }
    } catch {
      setSnackbar(t('settings.googleDrive.signInFailed'))
    } finally {
      setSigningIn(false)
    }
  }

  const handleSignOut = () => {
    Alert.alert(
      t('settings.googleDrive.signOutTitle'),
      t('settings.googleDrive.signOutMessage'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('settings.googleDrive.signOutButton'),
          style: "destructive",
          onPress: async () => {
            await signOutFromGoogle()
            setSignedIn(false)
            setSyncOn(false)
            setEmail("")
            setSnackbar(t('settings.googleDrive.signedOut'))
          },
        },
      ]
    )
  }

  const handleToggleSync = async (value) => {
    setSyncOn(value)
    try {
      if (value) {
        await enableSync()
        setSnackbar(t('settings.googleDrive.enabled'))
        // Upload all existing data on first enable only
        const settings = await getSettings()
        if (!settings.googleDriveInitialUploadDone) {
          setUploading(true)
          try {
            const folders = await getRawFolders()
            const entries = await getRawEntries()
            const audioFiles = audioDir.exists
              ? audioDir.list().filter(f => f.name.endsWith(".wav"))
              : []
            const textFiles = textsDir.exists
              ? textsDir.list().filter(f => f.name.endsWith(".txt"))
              : []
            await uploadAllExistingData(folders, entries, audioFiles, textFiles)
            await updateSettings({ googleDriveInitialUploadDone: true })
            setSnackbar(t('settings.googleDrive.uploadComplete'))
          } catch (e) {
            if (__DEV__) console.warn("Initial upload failed:", e)
            setSnackbar(t('settings.googleDrive.uploadFailed'))
          } finally {
            setUploading(false)
          }
        }
      } else {
        await disableSync()
        setSnackbar(t('settings.googleDrive.disabled'))
      }
      await loadTombstoneCount()
    } catch (e) {
      setSyncOn(!value)
      setSnackbar(t('settings.googleDrive.toggleError'))
    }
  }

  const handleRestoreTombstoned = () => {
    Alert.alert(
      t('settings.googleDrive.restoreDeletedTitle'),
      t('settings.googleDrive.restoreDeletedMessage'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('settings.googleDrive.restoreDeletedButton'),
          onPress: async () => {
            setRestoring(true)
            try {
              await reviveTombstonedRecords()
              const localFolders = await getRawFolders()
              const localEntries = await getRawEntries()
              const result = await pullAndMerge(localFolders, localEntries)
              if (result.changed) {
                await overwriteFolders(result.folders)
                await overwriteEntries(result.entries)
              }
              setTombstoneCount(0)
              setSnackbar(t('settings.googleDrive.restored'))
            } catch (e) {
              setSnackbar(t('settings.googleDrive.restoreFailed'))
              if (__DEV__) console.warn("Tombstone restore failed:", e.message)
            } finally {
              setRestoring(false)
            }
          },
        },
      ]
    )
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="google-drive" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>{t('settings.googleDrive.title')}</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        <Text style={[typography.caption, { marginBottom: spacing.md }]}>
          {t('settings.googleDrive.caption')}
        </Text>

        {!signedIn ? (
          <Button
            mode="outlined"
            onPress={handleSignIn}
            loading={signingIn}
            disabled={signingIn}
            icon="login"
            style={styles.btn}
          >
            {t('settings.googleDrive.signIn')}
          </Button>
        ) : (
          <>
            <Text style={[typography.caption, { marginBottom: spacing.md, color: colors.muted }]}>
              {t('settings.googleDrive.connectedAs', { email })}
            </Text>

            <TouchableRipple
              onPress={() => handleToggleSync(!syncOn)}
              style={styles.toggleRow}
            >
              <View style={styles.toggleRowInner}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{t('settings.googleDrive.syncOn')}</Text>
                  <Text style={[typography.caption, { marginTop: 2 }]}>
                    {t('settings.googleDrive.syncDesc')}
                  </Text>
                </View>
                <Switch
                  value={syncOn}
                  onValueChange={handleToggleSync}
                  color={colors.primary}
                />
              </View>
            </TouchableRipple>

            {uploading && (
              <View style={{ marginTop: spacing.md, flexDirection: "row", alignItems: "center" }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[typography.caption, { marginLeft: spacing.sm }]}>
                  {t('settings.googleDrive.uploading')}
                </Text>
              </View>
            )}

            {syncOn && tombstoneCount > 0 && (
              <View style={{ marginTop: spacing.lg }}>
                <Button
                  mode="outlined"
                  onPress={handleRestoreTombstoned}
                  loading={restoring}
                  disabled={restoring}
                  icon="backup-restore"
                  style={styles.btn}
                >
                  {t('settings.googleDrive.restoreDeleted', { count: tombstoneCount })}
                </Button>
                <Text style={[typography.caption, { marginTop: spacing.xs, color: colors.muted }]}>
                  {t('settings.googleDrive.restoreDeletedDesc')}
                </Text>
              </View>
            )}

            <Button
              mode="text"
              onPress={handleSignOut}
              textColor={colors.danger}
              style={{ marginTop: spacing.lg }}
              compact
            >
              {t('settings.googleDrive.signOut')}
            </Button>
          </>
        )}
      </View>
    </View>
  )
}
