import React, { useEffect, useState } from "react"
import { Alert, Platform, View } from "react-native"
import { Button, Divider, Switch, Text, TouchableRipple } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import {
  isICloudAvailable,
  enableSync,
  disableSync,
  pullAndMerge,
} from "../../services/icloudSyncService"
import {
  getTombstonedEntries,
  getTombstonedFolders,
  reviveTombstonedRecords,
  getRawFolders,
  getRawEntries,
  overwriteFolders,
  overwriteEntries,
} from "../../services/journalStorage"
import { getSettings } from "../../services/settingsService"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"
import { t } from "../../src/i18n"

export default function ICloudSyncSection({ setSnackbar }) {
  const [icloudAvailable, setIcloudAvailable] = useState(false)
  const [icloudSyncOn, setIcloudSyncOn] = useState(false)
  const [restoring, setRestoring] = useState(false)
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
        if (Platform.OS === "ios") {
          const available = await isICloudAvailable()
          if (!ignore) setIcloudAvailable(available)
        }
        const settings = await getSettings()
        if (!ignore) setIcloudSyncOn(settings.icloudSyncEnabled)
      } catch (e) {
        if (__DEV__) console.warn("iCloud init failed:", e.message)
      }
      if (!ignore) await loadTombstoneCount()
    })()
    return () => { ignore = true }
  }, [])

  if (Platform.OS !== "ios") return null

  const handleToggleICloudSync = async (value) => {
    setIcloudSyncOn(value)
    try {
      if (value) {
        await enableSync()
        setSnackbar(t('settings.icloud.enabled'))
      } else {
        await disableSync()
        setSnackbar(t('settings.icloud.disabled'))
      }
      await loadTombstoneCount()
    } catch (e) {
      setIcloudSyncOn(!value)
      setSnackbar(t('settings.icloud.toggleError'))
    }
  }

  const handleRestoreTombstoned = () => {
    Alert.alert(
      t('settings.icloud.restoreDeletedTitle'),
      t('settings.icloud.restoreDeletedMessage'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('settings.icloud.restoreDeletedButton'),
          onPress: async () => {
            setRestoring(true)
            try {
              await reviveTombstonedRecords()
              // Re-sync from iCloud to get latest metadata + files
              const localFolders = await getRawFolders()
              const localEntries = await getRawEntries()
              const result = await pullAndMerge(localFolders, localEntries)
              if (result.changed) {
                await overwriteFolders(result.folders)
                await overwriteEntries(result.entries)
              }
              setTombstoneCount(0)
              setSnackbar(t('settings.icloud.restored'))
            } catch (e) {
              setSnackbar(t('settings.icloud.restoreFailed'))
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
        <MaterialCommunityIcons name="cloud-sync-outline" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>{t('settings.icloud.title')}</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        <Text style={[typography.caption, { marginBottom: spacing.md }]}>
          {t('settings.icloud.caption')}
        </Text>
        {!icloudAvailable ? (
          <Text style={[typography.body, { color: colors.warning }]}>
            {t('settings.icloud.notAvailable')}
          </Text>
        ) : (
          <>
            <TouchableRipple
              onPress={() => handleToggleICloudSync(!icloudSyncOn)}
              style={styles.toggleRow}
            >
              <View style={styles.toggleRowInner}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{t('settings.icloud.syncOn')}</Text>
                  <Text style={[typography.caption, { marginTop: 2 }]}>
                    {t('settings.icloud.syncDesc')}
                  </Text>
                </View>
                <Switch
                  value={icloudSyncOn}
                  onValueChange={handleToggleICloudSync}
                  color={colors.primary}
                />
              </View>
            </TouchableRipple>

            {icloudSyncOn && tombstoneCount > 0 && (
              <View style={{ marginTop: spacing.lg }}>
                <Button
                  mode="outlined"
                  onPress={handleRestoreTombstoned}
                  loading={restoring}
                  disabled={restoring}
                  icon="backup-restore"
                  style={styles.btn}
                >
                  {t('settings.icloud.restoreDeleted', { count: tombstoneCount })}
                </Button>
                <Text style={[typography.caption, { marginTop: spacing.xs, color: colors.muted }]}>
                  {t('settings.icloud.restoreDeletedDesc')}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  )
}
