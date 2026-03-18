import React, { useEffect, useState } from "react"
import { Platform, View } from "react-native"
import { Divider, Switch, Text, TouchableRipple } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { isICloudAvailable, enableSync, disableSync } from "../../services/icloudSyncService"
import { getSettings } from "../../services/settingsService"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"

export default function ICloudSyncSection({ setSnackbar }) {
  const [icloudAvailable, setIcloudAvailable] = useState(false)
  const [icloudSyncOn, setIcloudSyncOn] = useState(false)

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
    } catch (e) {
      setIcloudSyncOn(!value)
      setSnackbar("Greska pri promeni iCloud podesavanja.")
    }
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
  )
}
