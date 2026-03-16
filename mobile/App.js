import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PaperProvider } from "react-native-paper";
import { theme } from "./theme";
import { migrateData } from "./services/journalStorage";
import DirectoryHomeScreen from "./screens/DirectoryHomeScreen";
import DirectoryScreen from "./screens/DirectoryScreen";
import EntryScreen from "./screens/EntryScreen";

const Stack = createNativeStackNavigator();

const stackScreenOptions = {
  headerStyle: { backgroundColor: "#FFFFFF" },
  headerTintColor: "#111",
  headerTitleStyle: { fontWeight: "700" },
  contentStyle: { backgroundColor: "#F5F5F5" },
};

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    migrateData().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <PaperProvider theme={theme}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F5F5" }}>
          <ActivityIndicator size="large" color="#4A9EFF" />
        </View>
      </PaperProvider>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Stack.Navigator screenOptions={stackScreenOptions}>
          <Stack.Screen
            name="Home"
            component={DirectoryHomeScreen}
            options={{ title: "Diktafon" }}
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
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
