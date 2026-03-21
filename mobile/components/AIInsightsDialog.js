import React from "react";
import { Button, Dialog, Text } from "react-native-paper";
import { colors, radii, typography } from "../theme";
import { t } from "../src/i18n";

export default function AIInsightsDialog({ visible, onDismiss }) {
  return (
    <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
      <Dialog.Title style={typography.heading}>{t('aiInsights.title')}</Dialog.Title>
      <Dialog.Content>
        <Text style={[typography.body, { lineHeight: 22 }]}>
          {t('aiInsights.content')}
        </Text>
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={onDismiss} textColor={colors.primary}>{t('common.close')}</Button>
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
