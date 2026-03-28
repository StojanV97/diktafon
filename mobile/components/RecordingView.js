import React, { useEffect } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { colors, spacing, radii, iconSize, typography } from "../theme";
import { formatTimer } from "../src/utils/formatters";
import { t } from "../src/i18n";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Timer Ring ────────────────────────────────────────
const RING_SIZE = 180;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function TimerRing({ elapsed, isPaused }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (isPaused) {
      cancelAnimation(progress);
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 60000, easing: Easing.linear }),
      -1,
      false
    );
  }, [isPaused]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.value),
  }));

  return (
    <View style={styles.timerContainer}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
        {/* Background ring */}
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={colors.divider}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {/* Progress ring */}
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={colors.danger}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={RING_CIRCUMFERENCE}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <View style={styles.timerCenter}>
        <Text style={styles.timerText}>{formatTimer(elapsed)}</Text>
        <Text style={styles.timerLabel}>
          {isPaused ? t("recording.paused") : t("recording.recording")}
        </Text>
      </View>
    </View>
  );
}

// ── Real Metering Waveform ────────────────────────────
const BAR_COUNT = 48;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const BAR_MIN = 8;
const BAR_MAX = 50;
const MIN_DB = -60;

function dbToNormalized(db) {
  "worklet";
  const clamped = Math.max(MIN_DB, Math.min(0, db ?? -160));
  return (clamped - MIN_DB) / (0 - MIN_DB); // 0.0 to 1.0
}

function MeteringBar({ db, isPaused }) {
  const height = useSharedValue(BAR_MIN);

  useEffect(() => {
    const normalized = dbToNormalized(db);
    const target = BAR_MIN + normalized * (BAR_MAX - BAR_MIN);
    height.value = withTiming(target, { duration: 100, easing: Easing.out(Easing.quad) });
  }, [db]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: isPaused ? 0.35 : 0.6 + (height.value / BAR_MAX) * 0.4,
  }));

  return <Animated.View style={[styles.waveformBar, animatedStyle]} />;
}

function MeteringWaveform({ meteringHistory, isPaused }) {
  // Pad with silence at the start if fewer than BAR_COUNT entries
  const padCount = Math.max(0, BAR_COUNT - meteringHistory.length);
  const visible = meteringHistory.slice(-BAR_COUNT);

  return (
    <View style={styles.waveformContainer}>
      {Array.from({ length: padCount }, (_, i) => (
        <View key={`pad-${i}`} style={[styles.waveformBar, { height: BAR_MIN, opacity: 0.35 }]} />
      ))}
      {visible.map((db, i) => (
        <MeteringBar key={`m-${padCount + i}`} db={db} isPaused={isPaused} />
      ))}
    </View>
  );
}

// ── Recording Dot (pulsing) ───────────────────────────
function RecordingDot({ isPaused }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isPaused) {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 200 });
      return;
    }
    scale.value = withRepeat(
      withTiming(1.3, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [isPaused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[styles.recordingDot, animatedStyle]} />;
}

// ── Main Component ────────────────────────────────────
export default function RecordingView({
  saveLabel,
  title,
  elapsed,
  isPaused,
  meteringHistory = [],
  onPause,
  onResume,
  onStop,
  onCancel,
  onSettings,
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Header + Save card — pinned to top with safe area */}
      <View style={[styles.topArea, { paddingTop: insets.top + spacing.md }]}>
        {/* App header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLabel}>DIKTAPHONE</Text>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>
          {onSettings && (
            <TouchableOpacity style={styles.settingsBtn} onPress={onSettings} activeOpacity={0.7}>
              <MaterialCommunityIcons name="cog-outline" size={iconSize.md} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Save-to card */}
        <View style={styles.saveCard}>
          <View style={styles.saveCardAccent} />
          <View style={styles.saveCardBody}>
            <View style={styles.saveCardTopRow}>
              <MaterialCommunityIcons
                name="folder-outline"
                size={iconSize.sm}
                color={colors.danger}
                style={styles.saveCardIcon}
              />
              <Text style={styles.saveCardCategory}>
                {saveLabel.toUpperCase()}
              </Text>
              <View style={{ flex: 1 }} />
              <RecordingDot isPaused={isPaused} />
            </View>
            <Text style={styles.saveCardText}>
              {t("recording.inProgress")}
            </Text>
          </View>
        </View>
      </View>

      {/* Centered content area */}
      <View style={styles.centeredContent}>

      {/* Circular timer */}
      <TimerRing elapsed={elapsed} isPaused={isPaused} />

      {/* Real metering waveform */}
      <MeteringWaveform meteringHistory={meteringHistory} isPaused={isPaused} />

      {/* Controls */}
      <View style={styles.controls}>
        <View style={styles.controlItem}>
          <TouchableOpacity
            style={styles.discardBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCancel?.();
            }}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="close" size={iconSize.lg} color={colors.muted} />
          </TouchableOpacity>
          <Text style={styles.controlLabel}>{t("recording.discard")}</Text>
        </View>

        <View style={styles.controlItem}>
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
          <Text style={styles.controlLabel}>
            {isPaused ? t("recording.resume") : t("recording.pause")}
          </Text>
        </View>

        <View style={styles.controlItem}>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onStop();
            }}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="check" size={iconSize.lg} color={colors.surface} />
          </TouchableOpacity>
          <Text style={styles.controlLabel}>{t("recording.save")}</Text>
        </View>
      </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topArea: {
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.lg,
  },
  headerLabel: {
    ...typography.monoLabel,
    color: colors.danger,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    fontWeight: "700",
    fontSize: 22,
    color: colors.foreground,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  centeredContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },

  // Save-to card
  saveCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingRight: spacing.lg,
    marginHorizontal: spacing.sm,
  },
  saveCardAccent: {
    width: 4,
    alignSelf: "stretch",
    backgroundColor: colors.danger,
    borderRadius: 2,
    marginLeft: spacing.md,
    marginRight: spacing.md,
  },
  saveCardBody: {
    flex: 1,
  },
  saveCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  saveCardIcon: {
    marginRight: spacing.xs,
  },
  saveCardCategory: {
    ...typography.monoLabel,
    color: colors.danger,
    fontSize: 10,
    marginBottom: 2,
  },
  saveCardText: {
    ...typography.subheading,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },

  // Timer
  timerContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxxl,
  },
  ringSvg: {
    position: "absolute",
  },
  timerCenter: {
    alignItems: "center",
  },
  timerText: {
    fontFamily: "Menlo", fontWeight: "500",
    fontSize: 36,
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
    letterSpacing: -1,
  },
  timerLabel: {
    ...typography.monoLabel,
    fontSize: 10,
    color: colors.muted,
    marginTop: spacing.xs,
  },

  // Waveform
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: BAR_MAX + 4,
    gap: BAR_GAP,
    marginBottom: spacing.xxxl,
  },
  waveformBar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: colors.danger,
  },

  // Controls
  controls: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xxl,
  },
  controlItem: {
    alignItems: "center",
  },
  discardBtn: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.xl,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseBtn: {
    backgroundColor: colors.danger,
    borderRadius: 22,
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    backgroundColor: colors.success,
    borderRadius: radii.xl,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  controlLabel: {
    ...typography.mono,
    fontSize: 10,
    color: colors.muted,
    marginTop: spacing.sm,
  },
});
