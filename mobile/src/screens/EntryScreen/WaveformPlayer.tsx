import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "../../../theme";

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MIN_BAR = 4;
const MAX_BAR = 56;
const CURSOR_WIDTH = 3;
const SEEK_TRACK_HEIGHT = 3;
const SEEK_CIRCLE_SIZE = 14;

interface WaveformPlayerProps {
  amplitudes: number[];
  progress: number;
  onSeek: (fraction: number) => void;
}

export default function WaveformPlayer({
  amplitudes,
  progress,
  onSeek,
}: WaveformPlayerProps) {
  const [totalWidth, setTotalWidth] = useState(1);

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
  const cursorLeft = progress * totalWidth;
  const progressPct = `${Math.min(100, progress * 100)}%`;

  return (
    <Pressable
      style={styles.wrapper}
      onLayout={(e) => setTotalWidth(e.nativeEvent.layout.width)}
      onPress={handlePress}
    >
      {/* Waveform bars + red cursor */}
      <View style={styles.waveformArea}>
        <View style={styles.barsRow}>
          {amplitudes.map((amp, i) => {
            const height = MIN_BAR + amp * (MAX_BAR - MIN_BAR);
            const played = i <= playheadIndex;
            return (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height,
                    backgroundColor: played ? colors.danger : colors.muted,
                    opacity: played ? 1 : 0.3,
                  },
                ]}
              />
            );
          })}
        </View>
        {/* Red playhead cursor */}
        {progress > 0 && (
          <View
            style={[
              styles.cursor,
              { left: cursorLeft - CURSOR_WIDTH / 2 },
            ]}
          />
        )}
      </View>

      {/* Seek bar with red/gray split track */}
      <View style={styles.seekRow}>
        <View style={styles.seekTrack} />
        <View
          style={[styles.seekTrackFill, { width: progressPct as any }]}
        />
        <View
          style={[
            styles.seekCircle,
            { left: cursorLeft - SEEK_CIRCLE_SIZE / 2 },
          ]}
        />
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
