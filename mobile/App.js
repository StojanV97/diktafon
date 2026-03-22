import { Buffer } from "@craftzdog/react-native-buffer"
global.Buffer = global.Buffer || Buffer

import React, { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Sentry from "@sentry/react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PaperProvider } from "react-native-paper";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import * as ScreenCapture from "expo-screen-capture";
import { theme, colors } from "./theme";
import { onAuthStateChange } from "./services/authService";
import { loginUser } from "./services/subscriptionService";
import { t } from "./src/i18n";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { useAppInit } from "./src/hooks/useAppInit";
import { useBiometricLock } from "./src/hooks/useBiometricLock";
import { linking } from "./src/navigation/linking";
import { stackScreenOptions } from "./src/navigation/options";
import DirectoryHomeScreen from "./screens/DirectoryHomeScreen";
import DirectoryScreen from "./screens/DirectoryScreen";
import EntryScreen from "./screens/EntryScreen";
import DailyLogScreen from "./screens/DailyLogScreen";
import SettingsScreen from "./screens/SettingsScreen";
import AuthScreen from "./screens/AuthScreen";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    beforeSend(event) {
      const scrub = (str) => str?.replace(/\/Users\/[^\s:]+/g, "[path]")
        .replace(/\/var\/mobile\/[^\s:]+/g, "[path]")
        .replace(/\/data\/data\/[^\s:]+/g, "[path]")

      if (event.message) event.message = scrub(event.message)
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) ex.value = scrub(ex.value)
        }
      }

      if (event.breadcrumbs) {
        for (const bc of event.breadcrumbs) {
          if (bc.data?.url) bc.data.url = bc.data.url.replace(/key=[^&]+/, "key=[REDACTED]")
        }
      }

      return event
    },
  })
}

SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

function App() {
  const { ready, initialRoute } = useAppInit();
  const { locked, unlock, checkPendingControlAction } = useBiometricLock(navigationRef);
  const [fontTimeout, setFontTimeout] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setFontTimeout(true);
      Sentry.addBreadcrumb({
        category: "startup",
        message: "Font loading timed out after 10s",
        level: "warning",
      });
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  // Enable app-switcher blur protection (iOS)
  useEffect(() => {
    ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => {});
    return () => { ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {}); };
  }, []);

  // Auth state listener — link RevenueCat on sign-in
  useEffect(() => {
    const subscription = onAuthStateChange((session) => {
      if (session?.user?.id) {
        loginUser(session.user.id).catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if ((fontsLoaded || fontTimeout) && ready) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontTimeout, ready]);

  if ((!fontsLoaded && !fontTimeout) || !ready) {
    return (
      <PaperProvider theme={theme}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </PaperProvider>
    );
  }

  if (locked) {
    return (
      <PaperProvider theme={theme}>
        <View style={styles.loading} onLayout={onLayoutRootView}>
          <Text style={styles.lockTitle}>{t('app.lockTitle')}</Text>
          <TouchableOpacity style={styles.lockButton} onPress={unlock}>
            <Text style={styles.lockButtonText}>{t('app.unlock')}</Text>
          </TouchableOpacity>
        </View>
      </PaperProvider>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <ErrorBoundary>
        <View style={styles.flex1} onLayout={onLayoutRootView}>
          <NavigationContainer linking={linking} ref={navigationRef} onReady={checkPendingControlAction}>
            <StatusBar style="dark" />
            <Stack.Navigator initialRouteName={initialRoute} screenOptions={stackScreenOptions}>
              <Stack.Screen name="Home" component={DirectoryHomeScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Directory" component={DirectoryScreen} options={({ route }) => ({ title: route.params?.name || t('nav.directory') })} />
              <Stack.Screen name="Entry" component={EntryScreen} options={{ title: t('nav.entry') }} />
              <Stack.Screen name="DailyLog" component={DailyLogScreen} options={{ title: t('nav.dailyLog') }} />
              <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
              <Stack.Screen name="Auth" component={AuthScreen} options={{ title: t('nav.auth') }} />
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </ErrorBoundary>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  flex1: { flex: 1 },
  lockTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: colors.foreground, marginBottom: 16 },
  lockButton: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  lockButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#FFF" },
});

export default SENTRY_DSN ? Sentry.wrap(App) : App;
