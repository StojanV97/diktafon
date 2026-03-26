import React, { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { colors, spacing, radii, iconSize, typography } from "../theme";
import { formatTimer } from "../src/utils/formatters";
import { t } from "../src/i18n";

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const WAVEFORM_HEIGHT = 80;
const MIN_BAR_HEIGHT = 3;
const MAX_BAR_HEIGHT = WAVEFORM_HEIGHT - 4;

function normalizeMetering(dB) {
  return Math.max(0, Math.min(1, (dB + 60) / 60));
}

function barHeight(dB) {
  return MIN_BAR_HEIGHT + normalizeMetering(dB) * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
}

function RecordingOverlay({ meteringHistory, elapsed, isPaused, onPause, onResume, onStop, onCancel }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: true });
    }
  }, [meteringHistory.length, isPaused]);

  return (
    <View style={styles.recordArea}>
      <View style={styles.waveformContainer}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.waveformScroll}
          contentContainerStyle={styles.waveformContent}
          scrollEnabled={false}
        >
          {meteringHistory.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: barHeight(m),
                  opacity: isPaused ? 0.35 : 1,
                },
              ]}
            />
          ))}
        </ScrollView>
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
  waveformContainer: {
    width: "100%",
    height: WAVEFORM_HEIGHT,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  waveformScroll: {
    flex: 1,
  },
  waveformContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: BAR_GAP,
    paddingVertical: 2,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: colors.danger,
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
});
