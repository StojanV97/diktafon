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

// ── Animated Waveform Bar ─────────────────────────────
const BAR_COUNT = 48;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const BAR_MIN = 8;
const BAR_MAX = 50;

function WaveformBar({ index, isPaused }) {
  const height = useSharedValue(BAR_MIN);

  useEffect(() => {
    if (isPaused) {
      cancelAnimation(height);
      return;
    }
    const baseHeight = BAR_MIN + Math.random() * (BAR_MAX - BAR_MIN) * 0.5;
    const duration = 800 + Math.random() * 600; // 0.8-1.4s

    height.value = baseHeight;
    height.value = withRepeat(
      withTiming(BAR_MIN + Math.random() * (BAR_MAX - BAR_MIN), {
        duration,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true // reverse (oscillate)
    );
  }, [isPaused]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: isPaused ? 0.35 : 0.6 + (height.value / BAR_MAX) * 0.4,
  }));

  return <Animated.View style={[styles.waveformBar, animatedStyle]} />;
}

function AnimatedWaveform({ isPaused }) {
  return (
    <View style={styles.waveformContainer}>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <WaveformBar key={i} index={i} isPaused={isPaused} />
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
        <MaterialCommunityIcons
          name="folder-outline"
          size={iconSize.md}
          color={colors.danger}
          style={styles.saveCardIcon}
        />
        <View style={styles.saveCardBody}>
          <Text style={styles.saveCardCategory}>
            {saveLabel.toUpperCase()}
          </Text>
          <Text style={styles.saveCardText}>
            {t("recording.inProgress")}
          </Text>
        </View>
        <RecordingDot isPaused={isPaused} />
      </View>
      </View>

      {/* Centered content area */}
      <View style={styles.centeredContent}>

      {/* Circular timer */}
      <TimerRing elapsed={elapsed} isPaused={isPaused} />

      {/* Animated waveform */}
      <AnimatedWaveform isPaused={isPaused} />

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
    fontFamily: "Inter_700Bold",
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
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.sm,
    overflow: "hidden",
  },
  saveCardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.danger,
    borderTopLeftRadius: radii.lg,
    borderBottomLeftRadius: radii.lg,
  },
  saveCardIcon: {
    marginRight: spacing.md,
  },
  saveCardBody: {
    flex: 1,
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
    fontFamily: "JetBrainsMono_500Medium",
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
