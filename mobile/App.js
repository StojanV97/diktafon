import React, { useCallback, useEffect, useState } from "react";
import { Alert, AppState, View, ActivityIndicator, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Sentry from "@sentry/react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PaperProvider } from "react-native-paper";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { theme, colors } from "./theme";
import { migrateData, getCorruptionStatus, getRawFolders, getRawEntries, overwriteFolders, overwriteEntries } from "./services/journalStorage";
import { releaseContext } from "./services/whisperService";
import { syncWidgetData } from "./services/widgetDataService";
import { runAutoMove } from "./services/autoMoveService";
import { onAuthStateChange } from "./services/authService";
import { initPurchases, loginUser } from "./services/subscriptionService";
import { pullAndMerge, isSyncEnabled } from "./services/icloudSyncService";
import DirectoryHomeScreen from "./screens/DirectoryHomeScreen";
import DirectoryScreen from "./screens/DirectoryScreen";
import EntryScreen from "./screens/EntryScreen";
import DailyLogScreen from "./screens/DailyLogScreen";
import SettingsScreen from "./screens/SettingsScreen";
import AuthScreen from "./screens/AuthScreen";

Sentry.init({
  // TODO: Replace with your Sentry DSN
  dsn: "YOUR_SENTRY_DSN",
  tracesSampleRate: 0.2,
});

SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();

const linking = {
  prefixes: ["com.diktafon.app://"],
  config: {
    screens: {
      DailyLog: { path: "dailylog" },
    },
  },
};

const stackScreenOptions = {
  animation: "slide_from_right",
  headerShadowVisible: false,
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.foreground,
  headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  contentStyle: { backgroundColor: colors.background },
};

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    Sentry.captureException(error, { extra: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Nesto nije u redu</Text>
          <TouchableOpacity
            style={errorStyles.button}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={errorStyles.buttonText}>Ponovo pokreni</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const loadingStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  flex1: { flex: 1 },
});

const errorStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: colors.foreground, marginBottom: 16 },
  button: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#FFF" },
});

function App() {
  const [ready, setReady] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    async function init() {
      await migrateData();

      // Init RevenueCat
      try {
        await initPurchases("ios");
      } catch (e) {
        console.warn("RevenueCat init failed:", e.message);
      }

      setReady(true);
      syncWidgetData();
      runAutoMove();

      const corrupted = getCorruptionStatus();
      if (corrupted) {
        Alert.alert(
          "Upozorenje",
          "Podaci su mozda osteceni. Preporucujemo vracanje iz rezervne kopije.",
          [{ text: "U redu" }]
        );
      }

      // iCloud sync on launch
      try {
        const syncEnabled = await isSyncEnabled();
        if (syncEnabled) {
          const localFolders = await getRawFolders();
          const localEntries = await getRawEntries();
          const result = await pullAndMerge(localFolders, localEntries);
          if (result.changed) {
            overwriteFolders(result.folders);
            overwriteEntries(result.entries);
          }
        }
      } catch (e) {
        console.warn("iCloud sync on launch failed:", e.message);
      }
    }
    init();
  }, []);

  // Release whisper context when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        releaseContext();
      } else if (state === "active") {
        runAutoMove();
      }
    });
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
    if (fontsLoaded && ready) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, ready]);

  if (!fontsLoaded || !ready) {
    return (
      <PaperProvider theme={theme}>
        <View style={loadingStyles.container}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </PaperProvider>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <ErrorBoundary>
        <View style={loadingStyles.flex1} onLayout={onLayoutRootView}>
          <NavigationContainer linking={linking}>
            <StatusBar style="dark" />
            <Stack.Navigator screenOptions={stackScreenOptions}>
              <Stack.Screen
                name="Home"
                component={DirectoryHomeScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Directory"
                component={DirectoryScreen}
                options={({ route }) => ({ title: route.params?.name || "Direktorijum" })}
              />
              <Stack.Screen
                name="Entry"
                component={EntryScreen}
                options={{ title: "Zapis" }}
              />
              <Stack.Screen
                name="DailyLog"
                component={DailyLogScreen}
                options={{ title: "Brzi Zapis" }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ title: "Podesavanja" }}
              />
              <Stack.Screen
                name="Auth"
                component={AuthScreen}
                options={{ title: "Prijava" }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </ErrorBoundary>
    </PaperProvider>
  );
}

export default Sentry.wrap(App);
