import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "../../../theme";

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MIN_BAR = 4;
const MAX_BAR = 56;

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

  return (
    <Pressable
      style={styles.container}
      onLayout={(e) => setTotalWidth(e.nativeEvent.layout.width)}
      onPress={handlePress}
    >
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
                backgroundColor: colors.primary,
                opacity: played ? 1 : 0.25,
              },
            ]}
          />
        );
      })}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
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
});
