import React from "react";
import { StyleSheet } from "react-native";
import { Button, Dialog, Text } from "react-native-paper";
import { colors, radii, typography } from "../theme";

export default function DeleteConfirmDialog({ visible, onDismiss, onConfirm, title, message, confirmLabel }) {
  return (
    <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
      <Dialog.Title style={typography.heading}>{title}</Dialog.Title>
      <Dialog.Content>
        <Text style={typography.body}>{message}</Text>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss} textColor={colors.muted}>Otkazi</Button>
        <Button onPress={onConfirm} textColor={colors.danger}>{confirmLabel || "Obrisi"}</Button>
      </Dialog.Actions>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: radii.lg, backgroundColor: colors.surface },
});
