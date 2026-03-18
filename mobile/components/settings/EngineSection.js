import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { Divider, RadioButton, Text, TouchableRipple } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { getSettings, updateSettings } from "../../services/settingsService"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"

export default function EngineSection() {
  const [defaultEngine, setDefaultEngine] = useState("local")

  useEffect(() => {
    ;(async () => {
      const settings = await getSettings()
      setDefaultEngine(settings.defaultEngine)
    })()
  }, [])

  const handleEngineChange = async (value) => {
    setDefaultEngine(value)
    await updateSettings({ defaultEngine: value })
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="cog-outline" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>Podrazumevani motor</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        <RadioButton.Group onValueChange={handleEngineChange} value={defaultEngine}>
          <TouchableRipple onPress={() => handleEngineChange("local")}>
            <View style={radioStyles.radioRow}>
              <RadioButton value="local" color={colors.primary} />
              <View style={radioStyles.radioInfo}>
                <Text style={typography.body}>Na uredjaju (privatno)</Text>
                <Text style={[typography.caption, { marginTop: 2 }]}>
                  Whisper AI, bez interneta
                </Text>
              </View>
            </View>
          </TouchableRipple>
          <TouchableRipple onPress={() => handleEngineChange("assemblyai")}>
            <View style={radioStyles.radioRow}>
              <RadioButton value="assemblyai" color={colors.primary} />
              <View style={radioStyles.radioInfo}>
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
  )
}

const { StyleSheet } = require("react-native")
const radioStyles = StyleSheet.create({
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  radioInfo: { flex: 1, paddingLeft: spacing.xs },
})
