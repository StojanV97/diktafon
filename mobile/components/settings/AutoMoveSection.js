import React, { useEffect, useState } from "react"
import { StyleSheet, TouchableOpacity, View } from "react-native"
import { Button, Dialog, Divider, Portal, Switch, Text, TouchableRipple } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { fetchFolders, getFolder } from "../../services/journalStorage"
import { getSettings, updateSettings } from "../../services/settingsService"
import { colors, spacing, radii, typography } from "../../theme"
import { sectionStyles } from "./sectionStyles"
import { t } from "../../src/i18n"

export default function AutoMoveSection({ setSnackbar }) {
  const [autoMoveFolder, setAutoMoveFolder] = useState(null)
  const [autoMoveFolders, setAutoMoveFolders] = useState([])
  const [autoMoveDialogVisible, setAutoMoveDialogVisible] = useState(false)
  const [keepAudioOnMove, setKeepAudioOnMove] = useState(false)

  useEffect(() => {
    ;(async () => {
      const settings = await getSettings()
      setKeepAudioOnMove(settings.autoMoveKeepAudio)
      if (settings.autoMoveFolderId) {
        const folder = await getFolder(settings.autoMoveFolderId)
        if (folder) {
          setAutoMoveFolder({ id: folder.id, name: folder.name, color: folder.color })
        } else {
          await updateSettings({ autoMoveFolderId: null, autoMoveFolderName: null })
        }
      }
    })()
  }, [])

  const handleOpenAutoMoveDialog = async () => {
    const allFolders = await fetchFolders()
    setAutoMoveFolders(allFolders.filter((f) => !f.is_daily_log))
    setAutoMoveDialogVisible(true)
  }

  const handleSelectAutoMoveFolder = async (folder) => {
    await updateSettings({ autoMoveFolderId: folder.id, autoMoveFolderName: folder.name })
    setAutoMoveFolder({ id: folder.id, name: folder.name, color: folder.color })
    setAutoMoveDialogVisible(false)
    setSnackbar(`Automatsko premestanje: ${folder.name}`)
  }

  const handleClearAutoMove = async () => {
    await updateSettings({ autoMoveFolderId: null, autoMoveFolderName: null })
    setAutoMoveFolder(null)
    setSnackbar("Automatsko premestanje iskljuceno.")
  }

  const handleToggleKeepAudio = async (value) => {
    setKeepAudioOnMove(value)
    await updateSettings({ autoMoveKeepAudio: value })
  }

  return (
    <>
      <View style={sectionStyles.section}>
        <View style={sectionStyles.sectionHeader}>
          <MaterialCommunityIcons name="folder-move-outline" size={20} color={colors.primary} />
          <Text style={sectionStyles.sectionTitle}>{t('settings.autoMove.title')}</Text>
        </View>
        <Divider style={sectionStyles.divider} />
        <View style={sectionStyles.sectionBody}>
          <Text style={[typography.caption, { marginBottom: spacing.md }]}>
            {t('settings.autoMove.caption')}
          </Text>
          <View style={styles.autoMoveStatus}>
            {autoMoveFolder ? (
              <View style={styles.autoMoveFolderInfo}>
                <View style={[styles.autoMoveDot, { backgroundColor: autoMoveFolder.color || colors.primary }]} />
                <Text style={typography.body}>{autoMoveFolder.name}</Text>
              </View>
            ) : (
              <Text style={[typography.body, { color: colors.muted }]}>{t('settings.autoMove.off')}</Text>
            )}
          </View>
          <View style={sectionStyles.btnRow}>
            <Button
              mode="contained"
              onPress={handleOpenAutoMoveDialog}
              buttonColor={colors.primary}
              style={sectionStyles.btn}
            >
              {t('settings.autoMove.selectFolder')}
            </Button>
            {autoMoveFolder && (
              <Button
                mode="outlined"
                onPress={handleClearAutoMove}
                textColor={colors.danger}
                style={sectionStyles.btn}
              >
                {t('settings.autoMove.disable')}
              </Button>
            )}
          </View>
          {autoMoveFolder && (
            <TouchableRipple
              onPress={() => handleToggleKeepAudio(!keepAudioOnMove)}
              style={sectionStyles.toggleRow}
            >
              <View style={sectionStyles.toggleRowInner}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{t('settings.autoMove.keepAudio')}</Text>
                  <Text style={[typography.caption, { marginTop: 2 }]}>
                    {t('settings.autoMove.keepAudioDesc')}
                  </Text>
                </View>
                <Switch
                  value={keepAudioOnMove}
                  onValueChange={handleToggleKeepAudio}
                  color={colors.primary}
                />
              </View>
            </TouchableRipple>
          )}
        </View>
      </View>

      <Portal>
        <Dialog
          visible={autoMoveDialogVisible}
          onDismiss={() => setAutoMoveDialogVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={typography.heading}>{t('settings.autoMove.selectTitle')}</Dialog.Title>
          <Dialog.Content>
            {autoMoveFolders.length === 0 ? (
              <Text style={typography.body}>{t('settings.autoMove.noFolders')}</Text>
            ) : (
              autoMoveFolders.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  style={styles.folderRow}
                  onPress={() => handleSelectAutoMoveFolder(folder)}
                >
                  <View style={[styles.folderDot, { backgroundColor: folder.color || colors.primary }]} />
                  <Text style={[typography.body, { flex: 1 }]}>{folder.name}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
                </TouchableOpacity>
              ))
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAutoMoveDialogVisible(false)} textColor={colors.muted}>
              {t('common.cancel')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  )
}

const styles = StyleSheet.create({
  autoMoveStatus: {
    marginBottom: spacing.md,
  },
  autoMoveFolderInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  autoMoveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  dialog: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  folderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },
})
