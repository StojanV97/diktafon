import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, CommonActions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { PaperProvider, BottomNavigation } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { theme } from "./theme";
import HomeScreen from "./screens/HomeScreen";
import TranscribeScreen from "./screens/TranscribeScreen";
import TranscriptionDetailScreen from "./screens/TranscriptionDetailScreen";
import JournalHomeScreen from "./screens/JournalHomeScreen";
import JournalFolderScreen from "./screens/JournalFolderScreen";
import JournalEntryScreen from "./screens/JournalEntryScreen";

const Tab = createBottomTabNavigator();
const TranscriptStack = createNativeStackNavigator();
const JournalStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerStyle: { backgroundColor: "#1A1A1A" },
  headerTintColor: "#FFF",
  headerTitleStyle: { fontWeight: "700" },
  contentStyle: { backgroundColor: "#111" },
};

function TranscriptStackScreen() {
  return (
    <TranscriptStack.Navigator screenOptions={stackScreenOptions}>
      <TranscriptStack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "Diktafon" }}
      />
      <TranscriptStack.Screen
        name="Transcribe"
        component={TranscribeScreen}
        options={{ title: "Novi transkript" }}
      />
      <TranscriptStack.Screen
        name="Detail"
        component={TranscriptionDetailScreen}
        options={{ title: "Transkript" }}
      />
    </TranscriptStack.Navigator>
  );
}

function JournalStackScreen() {
  return (
    <JournalStack.Navigator screenOptions={stackScreenOptions}>
      <JournalStack.Screen
        name="JournalHome"
        component={JournalHomeScreen}
        options={{ title: "Dnevnik" }}
      />
      <JournalStack.Screen
        name="JournalFolder"
        component={JournalFolderScreen}
        options={({ route }) => ({ title: route.params?.name || "Folder" })}
      />
      <JournalStack.Screen
        name="JournalEntry"
        component={JournalEntryScreen}
        options={{ title: "Zapis" }}
      />
    </JournalStack.Navigator>
  );
}

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <StatusBar style="light" />
        <Tab.Navigator
          screenOptions={{ headerShown: false }}
          tabBar={({ navigation, state, descriptors, insets }) => (
            <BottomNavigation.Bar
              navigationState={state}
              safeAreaInsets={insets}
              style={{ backgroundColor: "#1A1A1A" }}
              activeColor="#4A9EFF"
              inactiveColor="#888"
              onTabPress={({ route, preventDefault }) => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!event.defaultPrevented) {
                  navigation.dispatch({
                    ...CommonActions.navigate(route.name, route.params),
                    target: state.key,
                  });
                }
              }}
              renderIcon={({ route, focused, color }) => {
                const { options } = descriptors[route.key];
                if (options.tabBarIcon) {
                  return options.tabBarIcon({ focused, color, size: 24 });
                }
                return null;
              }}
              getLabelText={({ route }) => {
                const { options } = descriptors[route.key];
                return options.tabBarLabel ?? options.title ?? route.name;
              }}
            />
          )}
        >
          <Tab.Screen
            name="TranskriptiTab"
            component={TranscriptStackScreen}
            options={{
              title: "Transkripti",
              tabBarIcon: ({ focused, color }) => (
                <MaterialCommunityIcons
                  name={focused ? "file-document" : "file-document-outline"}
                  size={24}
                  color={color}
                />
              ),
            }}
          />
          <Tab.Screen
            name="DnevnikTab"
            component={JournalStackScreen}
            options={{
              title: "Dnevnik",
              tabBarIcon: ({ focused, color }) => (
                <MaterialCommunityIcons
                  name={focused ? "microphone" : "microphone-outline"}
                  size={24}
                  color={color}
                />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
