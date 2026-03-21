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
        setSnackbar("iCloud sinhronizacija ukljucena.")
      } else {
        await disableSync()
        setSnackbar("iCloud sinhronizacija iskljucena.")
      }
      await loadTombstoneCount()
    } catch (e) {
      setIcloudSyncOn(!value)
      setSnackbar("Greska pri promeni iCloud podesavanja.")
    }
  }

  const handleRestoreTombstoned = () => {
    Alert.alert(
      "Vrati obrisane podatke",
      "Ovo ce vratiti sve lokalno obrisane podatke sa iCloud-a.",
      [
        { text: "Otkazi", style: "cancel" },
        {
          text: "Vrati",
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
              setSnackbar("Obrisani podaci su vraceni.")
            } catch (e) {
              setSnackbar("Vracanje podataka nije uspelo.")
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
          <>
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
                  Vrati obrisane podatke ({tombstoneCount})
                </Button>
                <Text style={[typography.caption, { marginTop: spacing.xs, color: colors.muted }]}>
                  Vraca lokalno obrisane zapise sa iCloud-a
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  )
}
