import React, { useEffect, useState } from "react"
import { TouchableOpacity, View, StyleSheet } from "react-native"
import { ActivityIndicator, Button, Dialog, RadioButton, Text } from "react-native-paper"
import { colors, spacing, radii, typography } from "../theme"
import { t } from "../src/i18n"
import { isPremium, getOfferings, purchasePackage } from "../services/subscriptionService"
import { hasDevKey } from "../services/cloudTranscriptionService"
import { getSession } from "../services/authService"

export default function EngineChoiceDialog({ visible, onDismiss, onConfirm, engineChoice, onEngineChange, title, navigation }) {
  const [premium, setPremium] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [offerings, setOfferings] = useState(null)
  const [purchaseLoading, setPurchaseLoading] = useState(false)
  const [loadingOfferings, setLoadingOfferings] = useState(false)

  useEffect(() => {
    if (!visible) { setShowUpgrade(false); return }
    let ignore = false
    ;(async () => {
      const hasPremium = await isPremium() || hasDevKey()
      if (!ignore) setPremium(hasPremium)
    })()
    return () => { ignore = true }
  }, [visible])

  const handleEngineChange = (value) => {
    if (value === "cloud" && !premium) {
      onEngineChange(value)
      setShowUpgrade(true)
      loadOfferingsIfNeeded()
      return
    }
    setShowUpgrade(false)
    onEngineChange(value)
  }

  const loadOfferingsIfNeeded = async () => {
    if (offerings) return
    setLoadingOfferings(true)
    try {
      const off = await getOfferings()
      setOfferings(off)
    } catch (e) {
      if (__DEV__) console.warn("Failed to load offerings:", e.message)
    } finally {
      setLoadingOfferings(false)
    }
  }

  const handleConfirm = () => {
    if (engineChoice === "cloud" && !premium) return
    onConfirm()
  }

  const handlePurchase = async (pkg) => {
    setPurchaseLoading(true)
    try {
      const result = await purchasePackage(pkg)
      if (result) {
        setPremium(true)
        setShowUpgrade(false)
        onConfirm()
      }
    } catch (e) {
      if (!e.userCancelled) {
        // Purchase failed silently — user can retry
      }
    } finally {
      setPurchaseLoading(false)
    }
  }

  const handleSignIn = () => {
    onDismiss()
    navigation?.navigate("Auth")
  }

  return (
    <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
      <Dialog.Title style={typography.heading}>
        {title || t('engine.chooseType')}
      </Dialog.Title>
      <Dialog.Content>
        <RadioButton.Group onValueChange={handleEngineChange} value={engineChoice}>
          <TouchableOpacity style={styles.engineRow} onPress={() => handleEngineChange("local")}>
            <RadioButton value="local" color={colors.primary} />
            <View style={styles.engineInfo}>
              <Text style={[typography.heading, { fontSize: 15 }]}>{t('engine.onDevice')}</Text>
              <Text style={[typography.body, { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }]}>
                {t('engine.onDeviceDesc')}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.engineRow} onPress={() => handleEngineChange("cloud")}>
            <RadioButton value="cloud" color={colors.primary} />
            <View style={styles.engineInfo}>
              <View style={styles.labelRow}>
                <Text style={[typography.heading, { fontSize: 15 }]}>{t('engine.cloud')}</Text>
                {!premium && (
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumBadgeText}>Premium</Text>
                  </View>
                )}
              </View>
              <Text style={[typography.body, { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }]}>
                {t('engine.cloudDesc')}
                {!premium && "\n" + t('settings.engine.premiumRequired')}
              </Text>
            </View>
          </TouchableOpacity>
        </RadioButton.Group>

        {showUpgrade && !premium && (
          <UpgradePrompt
            offerings={offerings}
            loading={loadingOfferings}
            purchaseLoading={purchaseLoading}
            onPurchase={handlePurchase}
            onSignIn={handleSignIn}
          />
        )}
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss} textColor={colors.muted}>{t('common.cancel')}</Button>
        <Button
          onPress={handleConfirm}
          textColor={colors.primary}
          disabled={engineChoice === "cloud" && !premium}
        >
          {t('common.start')}
        </Button>
      </Dialog.Actions>
    </Dialog>
  )
}

function UpgradePrompt({ offerings, loading, purchaseLoading, onPurchase, onSignIn }) {
  const [authenticated, setAuthenticated] = useState(null)

  useEffect(() => {
    let ignore = false
    getSession()
      .then((s) => { if (!ignore) setAuthenticated(!!s) })
      .catch(() => { if (!ignore) setAuthenticated(false) })
    return () => { ignore = true }
  }, [])

  if (authenticated === false) {
    return (
      <View style={styles.upgradeBox}>
        <Text style={[typography.body, { marginBottom: spacing.md }]}>
          {t('engine.signInRequired')}
        </Text>
        <Button mode="contained" onPress={onSignIn} buttonColor={colors.primary}>
          {t('engine.signIn')}
        </Button>
      </View>
    )
  }

  return (
    <View style={styles.upgradeBox}>
      <Text style={[typography.body, { fontWeight: "600", marginBottom: spacing.sm }]}>
        {t('engine.unlockPremium')}
      </Text>
      <Text style={[typography.caption, { marginBottom: spacing.md }]}>
        {t('engine.premiumCaption')}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : offerings?.availablePackages?.length > 0 ? (
        offerings.availablePackages.map((pkg) => (
          <Button
            key={pkg.identifier}
            mode="contained"
            onPress={() => onPurchase(pkg)}
            loading={purchaseLoading}
            disabled={purchaseLoading}
            buttonColor={colors.primary}
            style={{ marginBottom: spacing.sm }}
          >
            {pkg.product.title} — {pkg.product.priceString}
          </Button>
        ))
      ) : (
        <Text style={typography.caption}>
          {t('engine.notAvailable')}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  dialog: { borderRadius: radii.lg, backgroundColor: colors.surface },
  engineRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm },
  engineInfo: { flex: 1, paddingLeft: spacing.xs },
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
  upgradeBox: {
    backgroundColor: colors.primaryLight,
    padding: spacing.lg,
    borderRadius: radii.md,
    marginTop: spacing.lg,
  },
})
