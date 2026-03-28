import React, { useEffect, useState } from "react"
import { StyleSheet, View } from "react-native"
import { Divider, RadioButton, Text, TouchableRipple } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { getSettings, updateSettings } from "../../services/settingsService"
import { isPremium } from "../../services/subscriptionService"
import { hasDevKey } from "../../services/cloudTranscriptionService"
import { colors, spacing, radii, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"
import { t } from "../../src/i18n"

export default function EngineSection() {
  const [defaultEngine, setDefaultEngine] = useState("local")
  const [premium, setPremium] = useState(false)

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const settings = await getSettings()
        if (ignore) return
        setDefaultEngine(settings.defaultEngine)
        const hasPremium = await isPremium() || hasDevKey()
        if (ignore) return
        setPremium(hasPremium)
      } catch (e) {
        if (__DEV__) console.warn("EngineSection init failed:", e.message)
      }
    })()
    return () => { ignore = true }
  }, [])

  const handleEngineChange = async (value) => {
    if (value === "cloud" && !premium) return
    setDefaultEngine(value)
    await updateSettings({ defaultEngine: value })
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="cog-outline" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>{t('settings.engine.title')}</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        <RadioButton.Group onValueChange={handleEngineChange} value={defaultEngine}>
          <TouchableRipple onPress={() => handleEngineChange("local")}>
            <View style={radioStyles.radioRow}>
              <RadioButton value="local" color={colors.primary} />
              <View style={radioStyles.radioInfo}>
                <Text style={typography.body}>{t('settings.engine.onDevice')}</Text>
                <Text style={[typography.caption, { marginTop: 2 }]}>
                  {t('settings.engine.onDeviceDesc')}
                </Text>
              </View>
            </View>
          </TouchableRipple>
          <TouchableRipple onPress={() => handleEngineChange("cloud")} disabled={!premium}>
            <View style={[radioStyles.radioRow, !premium && { opacity: 0.5 }]}>
              <RadioButton value="cloud" color={colors.primary} disabled={!premium} />
              <View style={radioStyles.radioInfo}>
                <View style={radioStyles.labelRow}>
                  <Text style={typography.body}>{t('settings.engine.cloud')}</Text>
                  {!premium && (
                    <View style={radioStyles.premiumBadge}>
                      <Text style={radioStyles.premiumBadgeText}>Premium</Text>
                    </View>
                  )}
                </View>
                <Text style={[typography.caption, { marginTop: 2 }]}>
                  {premium
                    ? t('settings.engine.cloudDesc')
                    : t('settings.engine.premiumRequired')}
                </Text>
              </View>
            </View>
          </TouchableRipple>
        </RadioButton.Group>
      </View>
    </View>
  )
}

const radioStyles = StyleSheet.create({
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  radioInfo: { flex: 1, paddingLeft: spacing.xs },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  premiumBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  premiumBadgeText: {
    fontWeight: "600",
    fontSize: 11,
    color: colors.primary,
  },
})
