import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "../../../theme";

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MIN_BAR = 4;
const MAX_BAR = 56;
const CURSOR_WIDTH = 3;
const SEEK_TRACK_HEIGHT = 3;
const SEEK_CIRCLE_SIZE = 14;
const SMOOTH_DURATION = 100;

interface WaveformPlayerProps {
  amplitudes: number[];
  progress: number;
  onSeek: (fraction: number) => void;
}

function WaveformBar({ amp, played }: { amp: number; played: boolean }) {
  const height = useSharedValue(MIN_BAR);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    height.value = withTiming(MIN_BAR + amp * (MAX_BAR - MIN_BAR), {
      duration: SMOOTH_DURATION,
      easing: Easing.out(Easing.quad),
    });
  }, [amp]);

  useEffect(() => {
    opacity.value = withTiming(played ? 1 : 0.3, { duration: SMOOTH_DURATION });
  }, [played]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    backgroundColor: played ? colors.danger : colors.muted,
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.bar, animatedStyle]} />;
}

export default function WaveformPlayer({
  amplitudes,
  progress,
  onSeek,
}: WaveformPlayerProps) {
  const [totalWidth, setTotalWidth] = useState(1);
  const cursorPos = useSharedValue(0);
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    const target = progress * totalWidth;
    cursorPos.value = withTiming(target, {
      duration: SMOOTH_DURATION,
      easing: Easing.linear,
    });
    fillWidth.value = withTiming(target, {
      duration: SMOOTH_DURATION,
      easing: Easing.linear,
    });
  }, [progress, totalWidth]);

  const handlePress = useCallback(
    (event: any) => {
      const fraction = Math.max(
        0,
        Math.min(1, event.nativeEvent.locationX / totalWidth)
      );
      onSeek(fraction);
    },
    [totalWidth, onSeek]
  );

  const playheadIndex = progress > 0 ? Math.floor(progress * amplitudes.length) : -1;

  const cursorStyle = useAnimatedStyle(() => ({
    left: cursorPos.value - CURSOR_WIDTH / 2,
    opacity: cursorPos.value > 0 ? 1 : 0,
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: fillWidth.value,
  }));

  const circleStyle = useAnimatedStyle(() => ({
    left: cursorPos.value - SEEK_CIRCLE_SIZE / 2,
  }));

  return (
    <Pressable
      style={styles.wrapper}
      onLayout={(e) => setTotalWidth(e.nativeEvent.layout.width)}
      onPress={handlePress}
    >
      {/* Waveform bars + red cursor */}
      <View style={styles.waveformArea}>
        <View style={styles.barsRow}>
          {amplitudes.map((amp, i) => (
            <WaveformBar key={i} amp={amp} played={i <= playheadIndex} />
          ))}
        </View>
        <Animated.View style={[styles.cursor, cursorStyle]} />
      </View>

      {/* Seek bar with red/gray split track */}
      <View style={styles.seekRow}>
        <View style={styles.seekTrack} />
        <Animated.View style={[styles.seekTrackFill, fillStyle]} />
        <Animated.View style={[styles.seekCircle, circleStyle]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingBottom: 4,
  },
  waveformArea: {
    height: MAX_BAR,
    justifyContent: "center",
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "center",
    height: MAX_BAR,
    gap: BAR_GAP,
    justifyContent: "center",
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 1.5,
  },
  cursor: {
    position: "absolute",
    width: CURSOR_WIDTH,
    height: MAX_BAR * 0.6,
    backgroundColor: colors.danger,
    borderRadius: 1.5,
    top: MAX_BAR * 0.2,
  },
  seekRow: {
    height: SEEK_CIRCLE_SIZE,
    justifyContent: "center",
    marginTop: 6,
  },
  seekTrack: {
    height: SEEK_TRACK_HEIGHT,
    backgroundColor: colors.divider,
    borderRadius: SEEK_TRACK_HEIGHT / 2,
  },
  seekTrackFill: {
    position: "absolute",
    height: SEEK_TRACK_HEIGHT,
    backgroundColor: colors.danger,
    borderRadius: SEEK_TRACK_HEIGHT / 2,
    top: (SEEK_CIRCLE_SIZE - SEEK_TRACK_HEIGHT) / 2,
    left: 0,
  },
  seekCircle: {
    position: "absolute",
    width: SEEK_CIRCLE_SIZE,
    height: SEEK_CIRCLE_SIZE,
    borderRadius: SEEK_CIRCLE_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
});
