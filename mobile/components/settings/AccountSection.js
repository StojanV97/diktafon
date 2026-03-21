import React, { useEffect, useState } from "react"
import { Alert, View } from "react-native"
import { Button, Divider, Text } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { getUser, signOut } from "../../services/authService"
import { safeErrorMessage } from "../../utils/errorHelpers"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"

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
      "Odjava",
      "Da li zelis da se odjavis?",
      [
        { text: "Otkazi", style: "cancel" },
        {
          text: "Odjavi se",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut()
              setUser(null)
              onUserChanged?.(null)
              setSnackbar("Uspesno si se odjavio/la.")
            } catch (e) {
              setSnackbar(safeErrorMessage(e, "Odjava nije uspela."))
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
        <Text style={styles.sectionTitle}>Nalog</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        {user ? (
          <>
            <Text style={typography.body}>
              Prijavljen kao:{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                {user.email || "Apple ID"}
              </Text>
            </Text>
            <View style={styles.btnRow}>
              <Button
                mode="outlined"
                onPress={handleSignOut}
                textColor={colors.danger}
                style={styles.btn}
              >
                Odjavi se
              </Button>
            </View>
          </>
        ) : (
          <>
            <Text style={[typography.body, { color: colors.muted, marginBottom: spacing.md }]}>
              Prijavi se za cloud backup, sinhronizaciju i premium funkcije.
            </Text>
            <Button
              mode="contained"
              onPress={handleSignIn}
              buttonColor={colors.primary}
              icon="login"
              style={styles.btn}
            >
              Prijavi se
            </Button>
          </>
        )}
      </View>
    </View>
  )
}
