import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Sentry from "@sentry/react-native";
import { t } from "../i18n";
import { colors } from "../../theme";

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, { extra: errorInfo as any });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>{t("app.errorTitle")}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={styles.buttonText}>{t("app.retry")}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  title: {
    fontWeight: "600",
    fontSize: 18,
    color: colors.foreground,
    marginBottom: 16,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    fontWeight: "600",
    fontSize: 15,
    color: "#FFF",
  },
});
