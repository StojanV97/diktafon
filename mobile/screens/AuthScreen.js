import React, { useState } from "react"
import { Platform, StyleSheet, View } from "react-native"
import { Button, Text } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import * as AppleAuthentication from "expo-apple-authentication"
import { signInWithApple } from "../services/authService"
import { loginUser } from "../services/subscriptionService"
import { colors, spacing, radii, elevation, typography } from "../theme"

export default function AuthScreen({ navigation }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleAppleSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await signInWithApple()
      // Link RevenueCat to Supabase user
      if (data?.user?.id) {
        await loginUser(data.user.id)
      }
      navigation.goBack()
    } catch (e) {
      if (e.code === "ERR_REQUEST_CANCELED") {
        // User cancelled — not an error
      } else {
        setError(e.message || "Prijavljivanje nije uspelo")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = () => {
    navigation.goBack()
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="account-circle-outline" size={64} color={colors.primary} />
        </View>

        <Text style={styles.title}>Prijavi se</Text>

        <Text style={styles.subtitle}>
          Prijava ti omogucava backup u oblaku, sinhronizaciju izmedju uredjaja i premium funkcije.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {Platform.OS === "ios" && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radii.sm}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        )}

        <Button
          mode="text"
          onPress={handleSkip}
          textColor={colors.muted}
          style={styles.skipButton}
          disabled={loading}
        >
          Nastavi bez naloga
        </Button>
      </View>

      <View style={styles.footer}>
        <Text style={[typography.caption, styles.footerText]}>
          Aplikacija radi potpuno i bez naloga.{"\n"}
          Nalog je potreban samo za cloud backup i AssemblyAI transkripciju.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  title: {
    ...typography.title,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  subtitle: {
    ...typography.body,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.xxl,
    lineHeight: 22,
  },
  errorBox: {
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.lg,
    width: "100%",
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
  },
  appleButton: {
    width: "100%",
    height: 50,
    marginBottom: spacing.md,
  },
  skipButton: {
    marginTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  footerText: {
    textAlign: "center",
    lineHeight: 18,
  },
})
