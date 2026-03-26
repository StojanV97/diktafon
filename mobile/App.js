import { Buffer } from "@craftzdog/react-native-buffer"
global.Buffer = global.Buffer || Buffer

import React, { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Sentry from "@sentry/react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { PaperProvider } from "react-native-paper";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import * as ScreenCapture from "expo-screen-capture";
import { theme, colors, spacing } from "./theme";
import * as Haptics from "expo-haptics";
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
import RemindersScreen from "./screens/RemindersScreen";
import PlansScreen from "./screens/PlansScreen";
import * as Notifications from "expo-notifications";
import { initNotifications, handleNotificationResponse } from "./services/notificationService";

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

const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef();

const TAB_ICONS = {
  HomeTab: "home-outline",
  DailyLogsTab: "microphone-outline",
  PlansTab: "clipboard-text-outline",
  RemindersTab: "bell-outline",
};

// Shared stack screen options
const sharedScreens = (Stack) => (
  <>
    <Stack.Screen name="Entry" component={EntryScreen} options={{ title: t('nav.entry') }} />
    <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
    <Stack.Screen name="Auth" component={AuthScreen} options={{ title: t('nav.auth') }} />
  </>
);

function HomeStack() {
  const Stack = createNativeStackNavigator();
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="HomeRoot" component={DirectoryHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Directory" component={DirectoryScreen} options={({ route }) => ({ title: route.params?.name || t('nav.directory') })} />
      {sharedScreens(Stack)}
    </Stack.Navigator>
  );
}

function DailyLogsStack() {
  const Stack = createNativeStackNavigator();
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="DailyLogsRoot" component={DailyLogScreen} options={{ title: t("tabs.dailyLogs") }} />
      {sharedScreens(Stack)}
    </Stack.Navigator>
  );
}

function PlansStack() {
  const Stack = createNativeStackNavigator();
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="PlansRoot" component={PlansScreen} options={{ title: t("tabs.plans") }} />
      {sharedScreens(Stack)}
    </Stack.Navigator>
  );
}

function RemindersStack() {
  const Stack = createNativeStackNavigator();
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="RemindersRoot" component={RemindersScreen} options={{ title: t("tabs.reminders") }} />
      {sharedScreens(Stack)}
    </Stack.Navigator>
  );
}

function RootTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontWeight: "600" },
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons name={TAB_ICONS[route.name]} size={size} color={color} />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
          borderTopWidth: 0.5,
          paddingTop: spacing.sm,
          height: 88,
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: t("tabs.home") }} listeners={{ tabPress: () => Haptics.selectionAsync() }} />
      <Tab.Screen name="DailyLogsTab" component={DailyLogsStack} options={{ title: t("tabs.dailyLogs") }} listeners={{ tabPress: () => Haptics.selectionAsync() }} />
      <Tab.Screen name="PlansTab" component={PlansStack} options={{ title: t("tabs.plans") }} listeners={{ tabPress: () => Haptics.selectionAsync() }} />
      <Tab.Screen name="RemindersTab" component={RemindersStack} options={{ title: t("tabs.reminders") }} listeners={{ tabPress: () => Haptics.selectionAsync() }} />
    </Tab.Navigator>
  );
}

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

  // Initialize notifications
  useEffect(() => {
    initNotifications();
    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse(navigationRef)
    );
    return () => subscription.remove();
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
          <NavigationContainer linking={linking} ref={navigationRef} onReady={() => {
            checkPendingControlAction();
            if (initialRoute === "Auth") {
              navigationRef.current?.navigate("HomeTab", { screen: "Auth" });
            }
          }}>
            <StatusBar style="dark" />
            <RootTabs />
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
