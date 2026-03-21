import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { Button, Divider, ProgressBar, Text } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { isPremium, getOfferings, purchasePackage, restorePurchases, getUsageFromProfile, MONTHLY_MINUTES_LIMIT } from "../../services/subscriptionService"
import { getProfile } from "../../services/authService"
import { safeErrorMessage } from "../../utils/errorHelpers"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"
import { t } from "../../src/i18n"

export default function SubscriptionSection({ setSnackbar, user }) {
  const [premium, setPremium] = useState(false)
  const [usageInfo, setUsageInfo] = useState(null)
  const [offerings, setOfferings] = useState(null)
  const [purchaseLoading, setPurchaseLoading] = useState(false)

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const hasPremium = await isPremium()
        if (ignore) return
        setPremium(hasPremium)
        if (user) {
          const profile = await getProfile()
          if (ignore) return
          setUsageInfo(getUsageFromProfile(profile))
        }
      } catch { /* ignore */ }

      try {
        const off = await getOfferings()
        if (ignore) return
        setOfferings(off)
      } catch { /* ignore */ }
    })()
    return () => { ignore = true }
  }, [user])

  const handlePurchase = async (pkg) => {
    setPurchaseLoading(true)
    try {
      const result = await purchasePackage(pkg)
      setPremium(result)
      if (result) setSnackbar(t('settings.subscription.activated'))
    } catch (e) {
      if (e.userCancelled) return
      setSnackbar(safeErrorMessage(e, t('settings.subscription.purchaseFailed')))
    } finally {
      setPurchaseLoading(false)
    }
  }

  const handleRestore = async () => {
    setPurchaseLoading(true)
    try {
      const result = await restorePurchases()
      setPremium(result)
      setSnackbar(result ? t('settings.subscription.restored') : t('settings.subscription.noPurchases'))
    } catch (e) {
      setSnackbar(safeErrorMessage(e, t('settings.subscription.restoreFailed')))
    } finally {
      setPurchaseLoading(false)
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="star-outline" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>{t('settings.subscription.title')}</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        {premium ? (
          <>
            <View style={premiumStyles.premiumBadge}>
              <MaterialCommunityIcons name="check-decagram" size={20} color={colors.success} />
              <Text style={[typography.body, { marginLeft: spacing.sm, fontFamily: "Inter_600SemiBold" }]}>
                {t('settings.subscription.premiumBadge')}
              </Text>
            </View>
            {usageInfo && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={typography.body}>
                  {t('settings.subscription.usage', { used: usageInfo.used, limit: usageInfo.limit })}
                </Text>
                <ProgressBar
                  progress={usageInfo.used / usageInfo.limit}
                  color={usageInfo.remaining > 20 ? colors.primary : colors.warning}
                  style={[styles.progressBar, { marginTop: spacing.sm }]}
                />
                <Text style={[typography.caption, { marginTop: spacing.xs }]}>
                  {t('settings.subscription.remaining', { remaining: usageInfo.remaining })}
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={[typography.body, { marginBottom: spacing.md }]}>
              {t('settings.subscription.unlockCaption')}
            </Text>
            <Text style={[typography.caption, { marginBottom: spacing.lg }]}>
              {t('settings.subscription.features', { limit: MONTHLY_MINUTES_LIMIT })}
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
              {t('settings.subscription.restoreButton')}
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
