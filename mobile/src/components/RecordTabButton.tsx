import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors, elevation } from "../../theme";
import { recordingTrigger } from "../utils/recordingTrigger";

export default function RecordTabButton() {
  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[styles.button, elevation.md]}
        onPress={() => recordingTrigger.current?.()}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="microphone" size={26} color={colors.surface} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    top: -25,
  },
  button: {
    width: 65,
    height: 65,
    borderRadius: 35,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
});
