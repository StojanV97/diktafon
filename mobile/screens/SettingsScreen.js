import React, { useState } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import { Snackbar } from "react-native-paper"
import WhisperModelSection from "../components/settings/WhisperModelSection"
import EngineSection from "../components/settings/EngineSection"
import AutoMoveSection from "../components/settings/AutoMoveSection"
import BackupSection from "../components/settings/BackupSection"
import AccountSection from "../components/settings/AccountSection"
import ICloudSyncSection from "../components/settings/ICloudSyncSection"
import SubscriptionSection from "../components/settings/SubscriptionSection"
import { colors, spacing } from "../theme"

export default function SettingsScreen({ navigation }) {
  const [snackbar, setSnackbar] = useState("")
  const [user, setUser] = useState(null)

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <WhisperModelSection setSnackbar={setSnackbar} />
        <EngineSection />
        <AutoMoveSection setSnackbar={setSnackbar} />
        <BackupSection setSnackbar={setSnackbar} />
        <AccountSection
          navigation={navigation}
          setSnackbar={setSnackbar}
          onUserChanged={setUser}
        />
        <ICloudSyncSection setSnackbar={setSnackbar} />
        <SubscriptionSection setSnackbar={setSnackbar} user={user} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
      >
        {snackbar}
      </Snackbar>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 40 },
})
