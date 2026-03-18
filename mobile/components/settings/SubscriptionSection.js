import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { Button, Divider, ProgressBar, Text } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { isPremium, getOfferings, purchasePackage, restorePurchases, getUsageFromProfile, MONTHLY_MINUTES_LIMIT } from "../../services/subscriptionService"
import { getProfile } from "../../services/authService"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"

export default function SubscriptionSection({ setSnackbar, user }) {
  const [premium, setPremium] = useState(false)
  const [usageInfo, setUsageInfo] = useState(null)
  const [offerings, setOfferings] = useState(null)
  const [purchaseLoading, setPurchaseLoading] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const hasPremium = await isPremium()
        setPremium(hasPremium)
        if (user) {
          const profile = await getProfile()
          setUsageInfo(getUsageFromProfile(profile))
        }
      } catch { /* ignore */ }

      try {
        const off = await getOfferings()
        setOfferings(off)
      } catch { /* ignore */ }
    })()
  }, [user])

  const handlePurchase = async (pkg) => {
    setPurchaseLoading(true)
    try {
      const result = await purchasePackage(pkg)
      setPremium(result)
      if (result) setSnackbar("Premium je aktiviran!")
    } catch (e) {
      if (e.userCancelled) return
      setSnackbar("Kupovina nije uspela: " + e.message)
    } finally {
      setPurchaseLoading(false)
    }
  }

  const handleRestore = async () => {
    setPurchaseLoading(true)
    try {
      const result = await restorePurchases()
      setPremium(result)
      setSnackbar(result ? "Premium je obnovljen!" : "Nema prethodnih kupovina.")
    } catch (e) {
      setSnackbar("Obnova nije uspela: " + e.message)
    } finally {
      setPurchaseLoading(false)
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="star-outline" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>Pretplata</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        {premium ? (
          <>
            <View style={premiumStyles.premiumBadge}>
              <MaterialCommunityIcons name="check-decagram" size={20} color={colors.success} />
              <Text style={[typography.body, { marginLeft: spacing.sm, fontFamily: "Inter_600SemiBold" }]}>
                Diktafon Premium
              </Text>
            </View>
            {usageInfo && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={typography.body}>
                  AssemblyAI transkripcija: {usageInfo.used} / {usageInfo.limit} min ovog meseca
                </Text>
                <ProgressBar
                  progress={usageInfo.used / usageInfo.limit}
                  color={usageInfo.remaining > 20 ? colors.primary : colors.warning}
                  style={[styles.progressBar, { marginTop: spacing.sm }]}
                />
                <Text style={[typography.caption, { marginTop: spacing.xs }]}>
                  Preostalo: {usageInfo.remaining} min
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={[typography.body, { marginBottom: spacing.md }]}>
              Otključaj AssemblyAI cloud transkripciju sa prepoznavanjem govornika.
            </Text>
            <Text style={[typography.caption, { marginBottom: spacing.lg }]}>
              {MONTHLY_MINUTES_LIMIT} min/mesec cloud transkripcije · Visa tacnost · Prepoznavanje govornika
            </Text>
            {offerings?.availablePackages?.map((pkg) => (
              <Button
                key={pkg.identifier}
                mode="contained"
                onPress={() => handlePurchase(pkg)}
                loading={purchaseLoading}
                disabled={purchaseLoading}
                buttonColor={colors.primary}
                style={[styles.btn, { marginBottom: spacing.sm }]}
              >
                {pkg.product.title} — {pkg.product.priceString}
              </Button>
            ))}
            <Button
              mode="text"
              onPress={handleRestore}
              disabled={purchaseLoading}
              textColor={colors.muted}
              style={styles.btn}
            >
              Obnovi kupovinu
            </Button>
          </>
        )}
      </View>
    </View>
  )
}

const { StyleSheet } = require("react-native")
const premiumStyles = StyleSheet.create({
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.successLight,
    padding: spacing.md,
    borderRadius: require("../../theme").radii.sm,
  },
})
