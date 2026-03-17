import React from "react";
import { StyleSheet } from "react-native";
import { Dialog, ProgressBar, Text } from "react-native-paper";
import { colors, spacing, radii, typography } from "../theme";

export default function ModelDownloadDialog({ visible, progress }) {
  return (
    <Dialog visible={visible} dismissable={false} style={styles.dialog}>
      <Dialog.Title style={typography.heading}>Preuzimanje modela</Dialog.Title>
      <Dialog.Content>
        <Text style={[typography.body, { marginBottom: spacing.md }]}>
          Preuzimanje Whisper modela (~140 MB)...
        </Text>
        <ProgressBar progress={progress} color={colors.primary} style={{ height: 6, borderRadius: 3 }} />
        <Text style={[typography.caption, { marginTop: spacing.xs, textAlign: "center" }]}>
          {Math.round(progress * 100)}%
        </Text>
      </Dialog.Content>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: radii.lg, backgroundColor: colors.surface },
});
