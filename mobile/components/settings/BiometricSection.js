import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { Divider, Switch, Text } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import {
  isBiometricAvailable,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
} from "../../services/biometricService"
import { colors, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"

export default function BiometricSection({ setSnackbar }) {
  const [available, setAvailable] = useState(false)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    ;(async () => {
      const avail = await isBiometricAvailable()
      setAvailable(avail)
      if (avail) {
        const on = await isBiometricLockEnabled()
        setEnabled(on)
      }
    })()
  }, [])

  if (!available) return null

  const handleToggle = async (value) => {
    await setBiometricLockEnabled(value)
    setEnabled(value)
    setSnackbar(value ? "Biometrijsko zakljucavanje aktivirano." : "Biometrijsko zakljucavanje deaktivirano.")
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="fingerprint" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>Biometrijsko zakljucavanje</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        <View style={styles.toggleRowInner}>
          <Text style={typography.body}>Zakljucaj aplikaciju</Text>
          <Switch value={enabled} onValueChange={handleToggle} color={colors.primary} />
        </View>
        <Text style={[typography.caption, { color: colors.muted, marginTop: 4 }]}>
          Zahtevaj Face ID ili otisak prsta pri otvaranju aplikacije.
        </Text>
      </View>
    </View>
  )
}
