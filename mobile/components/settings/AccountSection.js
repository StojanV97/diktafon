import React, { useEffect, useState } from "react"
import { Alert, View } from "react-native"
import { Button, Divider, Text } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { getUser, signOut } from "../../services/authService"
import { safeErrorMessage } from "../../utils/errorHelpers"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"
import { t } from "../../src/i18n"

export default function AccountSection({ navigation, setSnackbar, onUserChanged }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const currentUser = await getUser()
        if (!ignore) {
          setUser(currentUser)
          onUserChanged?.(currentUser)
        }
      } catch {
        if (!ignore) {
          setUser(null)
          onUserChanged?.(null)
        }
      }
    })()
    return () => { ignore = true }
  }, [])

  const handleSignIn = () => {
    navigation.navigate("Auth")
  }

  const handleSignOut = async () => {
    Alert.alert(
      t('settings.account.signOutTitle'),
      t('settings.account.signOutConfirm'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('settings.account.signOut'),
          style: "destructive",
          onPress: async () => {
            try {
              await signOut()
              setUser(null)
              onUserChanged?.(null)
              setSnackbar(t('settings.account.signedOut'))
            } catch (e) {
              setSnackbar(safeErrorMessage(e, t('settings.account.signOutFailed')))
            }
          },
        },
      ]
    )
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="account-outline" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>{t('settings.account.title')}</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        {user ? (
          <>
            <Text style={typography.body}>
              {t('settings.account.signedInAs')}{" "}
              <Text style={{ fontWeight: "600" }}>
                {user.email || t('settings.account.appleId')}
              </Text>
            </Text>
            <View style={styles.btnRow}>
              <Button
                mode="outlined"
                onPress={handleSignOut}
                textColor={colors.danger}
                style={styles.btn}
              >
                {t('settings.account.signOut')}
              </Button>
            </View>
          </>
        ) : (
          <>
            <Text style={[typography.body, { color: colors.muted, marginBottom: spacing.md }]}>
              {t('settings.account.signInCaption')}
            </Text>
            <Button
              mode="contained"
              onPress={handleSignIn}
              buttonColor={colors.primary}
              icon="login"
              style={styles.btn}
            >
              {t('settings.account.signInButton')}
            </Button>
          </>
        )}
      </View>
    </View>
  )
}
