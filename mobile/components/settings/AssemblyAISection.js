import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { Button, Divider, Text, TextInput } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import * as assemblyAIService from "../../services/assemblyAIService"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"

export default function AssemblyAISection({ setSnackbar }) {
  const [apiKey, setApiKey] = useState("")
  const [savedKey, setSavedKey] = useState("")
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    ;(async () => {
      const key = (await assemblyAIService.getApiKey()) || ""
      setApiKey(key)
      setSavedKey(key)
    })()
  }, [])

  const handleSaveKey = async () => {
    const trimmed = apiKey.trim()
    if (!trimmed) return
    await assemblyAIService.setApiKey(trimmed)
    setSavedKey(trimmed)
    setSnackbar("API kljuc je sacuvan.")
  }

  const handleDeleteKey = async () => {
    await assemblyAIService.removeApiKey()
    setApiKey("")
    setSavedKey("")
    setSnackbar("API kljuc je obrisan.")
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="cloud-outline" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>AssemblyAI</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        <TextInput
          label="API kljuc"
          value={apiKey}
          onChangeText={setApiKey}
          mode="outlined"
          secureTextEntry={!showKey}
          right={
            <TextInput.Icon
              icon={showKey ? "eye-off" : "eye"}
              onPress={() => setShowKey(!showKey)}
            />
          }
          style={{ backgroundColor: colors.surface }}
          outlineColor={colors.borderGhost}
          activeOutlineColor={colors.primary}
        />
        <Text style={[typography.caption, { marginTop: spacing.xs }]}>
          Brze · Bolji kvalitet · Zahteva API kljuc
        </Text>
        <View style={styles.btnRow}>
          <Button
            mode="contained"
            onPress={handleSaveKey}
            disabled={!apiKey.trim() || apiKey.trim() === savedKey}
            buttonColor={colors.primary}
            style={styles.btn}
          >
            Sacuvaj
          </Button>
          {savedKey ? (
            <Button
              mode="outlined"
              onPress={handleDeleteKey}
              textColor={colors.danger}
              style={styles.btn}
            >
              Obrisi kljuc
            </Button>
          ) : null}
        </View>
      </View>
    </View>
  )
}
