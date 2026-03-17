import React from "react";
import { Button, Dialog, Text } from "react-native-paper";
import { colors, radii, typography } from "../theme";

export default function AIInsightsDialog({ visible, onDismiss }) {
  return (
    <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
      <Dialog.Title style={typography.heading}>AI uvidi</Dialog.Title>
      <Dialog.Content>
        <Text style={[typography.body, { lineHeight: 22 }]}>
          {"AI analiza ce omoguciti:\n\u2022 Automatsko sazimanje transkripata\n\u2022 Prepoznavanje govornika i tema\n\u2022 Pametan pregled kljucnih tacaka\n\u2022 Pretraga po sadrzaju unutar direktorijuma\n\nOva funkcija je u razvoju i bice dostupna uskoro."}
        </Text>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss} textColor={colors.primary}>Zatvori</Button>
      </Dialog.Actions>
    </Dialog>
  );
}

const styles = {
  dialog: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
};
