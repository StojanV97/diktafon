import React, { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PaperProvider } from "react-native-paper";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { theme, colors } from "./theme";
import { migrateData } from "./services/journalStorage";
import DirectoryHomeScreen from "./screens/DirectoryHomeScreen";
import DirectoryScreen from "./screens/DirectoryScreen";
import EntryScreen from "./screens/EntryScreen";
import DailyLogScreen from "./screens/DailyLogScreen";

SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();

const stackScreenOptions = {
  animation: "slide_from_right",
  headerShadowVisible: false,
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.foreground,
  headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  contentStyle: { backgroundColor: colors.background },
};

export default function App() {
  const [ready, setReady] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    migrateData().then(() => setReady(true));
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded && ready) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, ready]);

  if (!fontsLoaded || !ready) {
    return (
      <PaperProvider theme={theme}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </PaperProvider>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <NavigationContainer>
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
              options={{ title: "Dnevni Log" }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </PaperProvider>
  );
}
