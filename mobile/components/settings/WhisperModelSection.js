import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { Button, Divider, ProgressBar, Text } from "react-native-paper"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import * as whisperService from "../../services/whisperService"
import { safeErrorMessage } from "../../utils/errorHelpers"
import { colors, spacing, typography } from "../../theme"
import { sectionStyles as styles } from "./sectionStyles"
import { t } from "../../src/i18n"

function formatBytes(bytes) {
  if (!bytes) return "0 B"
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export default function WhisperModelSection({ setSnackbar }) {
  const [modelStatus, setModelStatus] = useState(whisperService.getModelStatus())
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    setModelStatus(whisperService.getModelStatus())
  }, [])

  const handleDownloadModel = async () => {
    setDownloading(true)
    setDownloadProgress(0)
    try {
      await whisperService.downloadModel((progress) => {
        setDownloadProgress(progress)
      })
      setModelStatus(whisperService.getModelStatus())
      setSnackbar(t('settings.whisper.downloadSuccess'))
    } catch (e) {
      setSnackbar(safeErrorMessage(e, t('settings.whisper.downloadFailed')))
    } finally {
      setDownloading(false)
    }
  }

  const handleDeleteModel = () => {
    whisperService.deleteModel()
    setModelStatus(whisperService.getModelStatus())
    setSnackbar(t('settings.whisper.deleted'))
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="brain" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>{t('settings.whisper.title')}</Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.sectionBody}>
        <Text style={typography.body}>
          {t('settings.whisper.status')}{" "}
          <Text style={{ fontWeight: "600" }}>
            {modelStatus.downloaded
              ? t('settings.whisper.downloaded', { size: formatBytes(modelStatus.sizeBytes) })
              : t('settings.whisper.notDownloaded')}
          </Text>
        </Text>
        <Text style={[typography.caption, { marginTop: spacing.xs }]}>
          {t('settings.whisper.caption')}
        </Text>
        {downloading && (
          <View style={{ marginTop: spacing.md }}>
            <ProgressBar
              progress={downloadProgress}
              color={colors.primary}
              style={styles.progressBar}
            />
            <Text style={[typography.caption, { marginTop: spacing.xs, textAlign: "center" }]}>
              {Math.round(downloadProgress * 100)}%
            </Text>
          </View>
        )}
        <View style={styles.btnRow}>
          {modelStatus.downloaded ? (
            <Button
              mode="outlined"
              onPress={handleDeleteModel}
              textColor={colors.danger}
              style={styles.btn}
            >
              {t('settings.whisper.deleteModel')}
            </Button>
          ) : (
            <Button
              mode="contained"
              onPress={handleDownloadModel}
              loading={downloading}
              disabled={downloading}
              buttonColor={colors.primary}
              style={styles.btn}
            >
              {t('settings.whisper.downloadModel')}
            </Button>
          )}
        </View>
      </View>
    </View>
  )
}
