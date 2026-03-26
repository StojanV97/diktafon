import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { colors, spacing, radii, iconSize, typography } from "../theme";
import { formatTimer } from "../src/utils/formatters";
import { t } from "../src/i18n";

function RecordingOverlay({ meteringHistory, elapsed, isPaused, onPause, onResume, onStop, onCancel }) {
  return (
    <View style={styles.recordArea}>
      <View style={styles.waveform}>
        {meteringHistory.map((m, i) => {
          const normalized = Math.max(0, Math.min(1, (m + 60) / 60));
          return (
            <View
              key={i}
              style={[
                styles.waveformBar,
                { height: 4 + normalized * 36, opacity: isPaused ? 0.4 : 1 },
              ]}
            />
          );
        })}
      </View>
      <Text style={[styles.timer, isPaused && styles.timerPaused]}>
        {formatTimer(elapsed)}
      </Text>
      <View style={styles.recordControls}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onCancel?.(); }}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="close" size={iconSize.lg} color={colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pauseBtn}
          onPress={isPaused ? onResume : onPause}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name={isPaused ? "play" : "pause"}
            size={iconSize.xl}
            color={colors.surface}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onStop(); }}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="check" size={iconSize.lg} color={colors.surface} />
        </TouchableOpacity>
      </View>
      <Text style={[typography.caption, { marginTop: spacing.md }]}>
        {isPaused ? t('recording.overlay.discardResumeSave') : t('recording.overlay.discardPauseSave')}
      </Text>
    </View>
  );
}

export default React.memo(RecordingOverlay);

const styles = StyleSheet.create({
  recordArea: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay,
  },
  timer: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 32,
    color: colors.danger,
    fontVariant: ["tabular-nums"],
    marginBottom: spacing.lg,
  },
  timerPaused: { color: colors.muted },
  recordControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
  },
  cancelBtn: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.xl,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseBtn: {
    backgroundColor: colors.danger,
    borderRadius: radii.xl,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    backgroundColor: colors.success,
    borderRadius: radii.xl,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  waveform: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  waveformBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: colors.danger,
  },
});
