import React from "react";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import { Button, Dialog, RadioButton, Text } from "react-native-paper";
import { colors, spacing, radii, typography } from "../theme";

export default function EngineChoiceDialog({ visible, onDismiss, onConfirm, engineChoice, onEngineChange, title }) {
  return (
    <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
      <Dialog.Title style={typography.heading}>
        {title || "Izaberi tip transkripcije"}
      </Dialog.Title>
      <Dialog.Content>
        <RadioButton.Group onValueChange={onEngineChange} value={engineChoice}>
          <TouchableOpacity style={styles.engineRow} onPress={() => onEngineChange("local")}>
            <RadioButton value="local" color={colors.primary} />
            <View style={styles.engineInfo}>
              <Text style={[typography.heading, { fontSize: 15 }]}>Na uredjaju — Besplatno</Text>
              <Text style={[typography.body, { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }]}>
                Transkripcija na uredjaju (Whisper AI). Potpuno privatno, bez interneta. Model ~140MB (preuzima se jednom).
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.engineRow} onPress={() => onEngineChange("assemblyai")}>
            <RadioButton value="assemblyai" color={colors.primary} />
            <View style={styles.engineInfo}>
              <Text style={[typography.heading, { fontSize: 15 }]}>AssemblyAI — Premium</Text>
              <Text style={[typography.body, { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }]}>
                Prepoznavanje govornika (ko je govorio sta), visa tacnost, podrska za akcentovane govore, automatske interpunkcije i detekcija tema.
                {"\n"}Potreban API kljuc (podesi u Podesavanjima).
              </Text>
            </View>
          </TouchableOpacity>
        </RadioButton.Group>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss} textColor={colors.muted}>Otkazi</Button>
        <Button onPress={onConfirm} textColor={colors.primary}>Pokreni</Button>
      </Dialog.Actions>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: radii.lg, backgroundColor: colors.surface },
  engineRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: spacing.sm },
  engineInfo: { flex: 1, paddingLeft: spacing.xs },
});
