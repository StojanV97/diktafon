import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { Divider, Text } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { hasEncryptionKey } from "../../services/cryptoService"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"

export default function EncryptionSection() {
  const [hasKey, setHasKey] = useState(false)

  useEffect(() => {
    hasEncryptionKey().then(setHasKey)
  }, [])

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="lock-outline" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>Sifrovanje podataka</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        {hasKey ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
              <MaterialCommunityIcons name="shield-check" size={18} color={colors.success} />
              <Text style={typography.body}>Podaci su sifrovani</Text>
            </View>
            <Text style={[typography.caption, { color: colors.muted }]}>
              Kljuc se automatski sinhronizuje preko iCloud Keychain-a
            </Text>
          </>
        ) : (
          <Text style={[typography.body, { color: colors.muted }]}>
            Sifrovanje ce biti aktivirano pri sledecoj transkripciji.
          </Text>
        )}
      </View>
    </View>
  )
}
