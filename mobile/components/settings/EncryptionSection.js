import React, { useEffect, useState } from "react"
import { Alert, View } from "react-native"
import { Button, Divider, Text, TextInput } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import * as Clipboard from "expo-clipboard"
import {
  hasEncryptionKey,
  exportRecoveryKey,
  importRecoveryKey,
} from "../../services/cryptoService"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"

export default function EncryptionSection({ setSnackbar }) {
  const [hasKey, setHasKey] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState(null)
  const [importInput, setImportInput] = useState("")
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    hasEncryptionKey().then(setHasKey)
  }, [])

  const handleShowKey = async () => {
    try {
      const key = await exportRecoveryKey()
      if (key) {
        setRecoveryKey(key)
      } else {
        setSnackbar("Kljuc za oporavak nije dostupan.")
      }
    } catch (e) {
      setSnackbar("Greska: " + e.message)
    }
  }

  const handleCopyKey = async () => {
    if (recoveryKey) {
      await Clipboard.setStringAsync(recoveryKey)
      setSnackbar("Kljuc je kopiran.")
    }
  }

  const handleImportKey = async () => {
    const trimmed = importInput.trim()
    if (!trimmed) {
      setSnackbar("Unesi kljuc za oporavak.")
      return
    }
    Alert.alert(
      "Unos kljuca",
      "Ovo ce zameniti trenutni kljuc za sifrovanje. Postojeci sifrovani podaci ce biti citljivi samo sa novim kljucem. Nastaviti?",
      [
        { text: "Otkazi", style: "cancel" },
        {
          text: "Nastavi",
          style: "destructive",
          onPress: async () => {
            try {
              await importRecoveryKey(trimmed)
              setHasKey(true)
              setShowImport(false)
              setImportInput("")
              setRecoveryKey(null)
              setSnackbar("Kljuc za oporavak je uspesno unet.")
            } catch (e) {
              setSnackbar("Greska: " + e.message)
            }
          },
        },
      ]
    )
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="lock-outline" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>Sifrovanje podataka</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        {hasKey ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }}>
              <MaterialCommunityIcons name="shield-check" size={18} color={colors.success} />
              <Text style={typography.body}>Podaci su sifrovani</Text>
            </View>

            {recoveryKey ? (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={[typography.caption, { marginBottom: spacing.xs }]}>
                  Kljuc za oporavak (sacuvaj na sigurnom mestu):
                </Text>
                <Text
                  style={{
                    fontFamily: "JetBrainsMono_400Regular",
                    fontSize: 12,
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    padding: spacing.sm,
                    borderRadius: 6,
                    marginBottom: spacing.sm,
                  }}
                  selectable
                >
                  {recoveryKey}
                </Text>
                <Button
                  mode="outlined"
                  onPress={handleCopyKey}
                  icon="content-copy"
                  style={styles.btn}
                  compact
                >
                  Kopiraj kljuc
                </Button>
              </View>
            ) : (
              <Button
                mode="outlined"
                onPress={handleShowKey}
                icon="key-variant"
                style={[styles.btn, { marginBottom: spacing.sm }]}
              >
                Prikazi kljuc za oporavak
              </Button>
            )}

            {showImport ? (
              <View>
                <TextInput
                  mode="outlined"
                  label="Kljuc za oporavak"
                  value={importInput}
                  onChangeText={setImportInput}
                  style={{ marginBottom: spacing.sm }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.btnRow}>
                  <Button
                    mode="contained"
                    onPress={handleImportKey}
                    buttonColor={colors.primary}
                    style={styles.btn}
                  >
                    Potvrdi
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => { setShowImport(false); setImportInput("") }}
                    style={styles.btn}
                  >
                    Otkazi
                  </Button>
                </View>
              </View>
            ) : (
              <Button
                mode="outlined"
                onPress={() => setShowImport(true)}
                icon="key-plus"
                style={styles.btn}
              >
                Unesi kljuc za oporavak
              </Button>
            )}
          </>
        ) : (
          <Text style={[typography.body, { color: colors.muted }]}>
            Sifrovanje ce biti aktivirano pri sledecoj transkripciji.
          </Text>
        )}
      </View>
    </View>
  )
}
